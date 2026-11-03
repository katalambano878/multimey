-- Stock reduction fixes for mark_order_paid / reduce_stock_on_order.
--
-- 1. Variants are matched by order_items.variant_id (set by /api/orders since
--    2026-11-03). Older items without one still match by name, including the
--    "Colour / Size" label the product page stores.
-- 2. Quantities are summed per product/variant first. An UPDATE ... FROM with
--    several matching order_items only applies one of them, so an order with
--    two lines of the same product used to reduce stock once.

CREATE OR REPLACE FUNCTION public.reduce_stock_on_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE products p
  SET quantity = GREATEST(p.quantity - t.qty, 0),
      updated_at = now()
  FROM (
    SELECT product_id, SUM(quantity) AS qty
    FROM order_items
    WHERE order_id = p_order_id AND product_id IS NOT NULL
    GROUP BY product_id
  ) t
  WHERE p.id = t.product_id;

  UPDATE product_variants pv
  SET quantity = GREATEST(pv.quantity - t.qty, 0),
      updated_at = now()
  FROM (
    SELECT COALESCE(oi.variant_id, (
             SELECT v.id FROM product_variants v
             WHERE v.product_id = oi.product_id
               AND oi.variant_name IS NOT NULL
               AND (oi.variant_name = v.name
                    OR oi.variant_name = CONCAT_WS(' / ', NULLIF(v.option2, ''), NULLIF(v.name, '')))
             ORDER BY v.created_at
             LIMIT 1
           )) AS variant_id,
           SUM(oi.quantity) AS qty
    FROM order_items oi
    WHERE oi.order_id = p_order_id
    GROUP BY 1
  ) t
  WHERE pv.id = t.variant_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_order_paid(order_ref text, moolre_ref text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  updated_order orders;
BEGIN
  UPDATE orders
  SET
    payment_status = 'paid',
    status = CASE
        WHEN status = 'pending' THEN 'processing'::order_status
        WHEN status = 'awaiting_payment' THEN 'processing'::order_status
        ELSE status
    END,
    metadata = COALESCE(metadata, '{}'::jsonb) ||
               jsonb_build_object(
                   'moolre_reference', moolre_ref,
                   'payment_verified_at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
               ),
    updated_at = now()
  WHERE order_number = order_ref
  RETURNING * INTO updated_order;

  IF updated_order.id IS NOT NULL THEN
      IF (updated_order.metadata->>'stock_reduced') IS NULL THEN
          PERFORM public.reduce_stock_on_order(updated_order.id);
          UPDATE orders
          SET metadata = metadata || '{"stock_reduced": true}'::jsonb
          WHERE id = updated_order.id
          RETURNING * INTO updated_order;
      END IF;
  ELSE
      SELECT * INTO updated_order FROM orders WHERE order_number = order_ref;
  END IF;

  RETURN to_jsonb(updated_order);
END;
$$;

-- 3. Put stock back when a paid order is cancelled or refunded. Runs once per
--    order: it clears the stock_reduced flag that mark_order_paid sets.
CREATE OR REPLACE FUNCTION public.restock_order(p_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  claimed uuid;
BEGIN
  UPDATE orders
  SET metadata = (metadata - 'stock_reduced') || jsonb_build_object('stock_restored_at', now())
  WHERE id = p_order_id AND (metadata->>'stock_reduced') IS NOT NULL
  RETURNING id INTO claimed;
  IF claimed IS NULL THEN
    RETURN false;
  END IF;

  UPDATE products p
  SET quantity = p.quantity + t.qty, updated_at = now()
  FROM (
    SELECT product_id, SUM(quantity) AS qty FROM order_items
    WHERE order_id = p_order_id AND product_id IS NOT NULL GROUP BY product_id
  ) t
  WHERE p.id = t.product_id;

  UPDATE product_variants pv
  SET quantity = pv.quantity + t.qty, updated_at = now()
  FROM (
    SELECT COALESCE(oi.variant_id, (
             SELECT v.id FROM product_variants v
             WHERE v.product_id = oi.product_id
               AND oi.variant_name IS NOT NULL
               AND (oi.variant_name = v.name
                    OR oi.variant_name = CONCAT_WS(' / ', NULLIF(v.option2, ''), NULLIF(v.name, '')))
             ORDER BY v.created_at LIMIT 1
           )) AS variant_id,
           SUM(oi.quantity) AS qty
    FROM order_items oi WHERE oi.order_id = p_order_id GROUP BY 1
  ) t
  WHERE pv.id = t.variant_id;

  RETURN true;
END;
$$;
