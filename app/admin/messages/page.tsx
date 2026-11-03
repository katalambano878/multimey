'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface Ticket {
  id: string;
  ticket_number: number;
  email: string;
  subject: string;
  description: string | null;
  category: string | null;
  status: 'open' | 'in_progress' | 'waiting_customer' | 'resolved' | 'closed';
  metadata: { name?: string; order_number?: string | null; source?: string } | null;
  created_at: string;
}

const STATUS_LABELS: Record<Ticket['status'], string> = {
  open: 'New',
  in_progress: 'In progress',
  waiting_customer: 'Waiting on customer',
  resolved: 'Resolved',
  closed: 'Closed',
};

const STATUS_STYLES: Record<Ticket['status'], string> = {
  open: 'bg-amber-100 text-amber-800',
  in_progress: 'bg-blue-100 text-blue-800',
  waiting_customer: 'bg-purple-100 text-purple-800',
  resolved: 'bg-gray-100 text-gray-800',
  closed: 'bg-gray-100 text-gray-500',
};

/** Contact-form messages and customer support tickets. */
export default function MessagesPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'active' | 'all'>('active');
  const [openId, setOpenId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const fetchTickets = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('support_tickets')
      .select('id, ticket_number, email, subject, description, category, status, metadata, created_at')
      .order('created_at', { ascending: false });
    if (error) console.error('Error fetching messages:', error);
    setTickets((data || []) as Ticket[]);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const setStatus = async (ticket: Ticket, status: Ticket['status']) => {
    setSavingId(ticket.id);
    const { error } = await supabase
      .from('support_tickets')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', ticket.id);
    setSavingId(null);
    if (error) {
      alert('Could not update the message: ' + error.message);
      return;
    }
    setTickets(prev => prev.map(t => (t.id === ticket.id ? { ...t, status } : t)));
  };

  const visible = tickets.filter(t => filter === 'all' || (t.status !== 'resolved' && t.status !== 'closed'));
  const newCount = tickets.filter(t => t.status === 'open').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Messages</h1>
          <p className="text-gray-600 mt-1">Contact form messages and customer support requests</p>
        </div>
        <button
          onClick={fetchTickets}
          className="border-2 border-gray-300 hover:border-gray-400 text-gray-700 px-4 py-2 rounded-lg font-semibold transition-colors flex items-center whitespace-nowrap"
        >
          <i className="ri-refresh-line mr-2"></i>
          Refresh
        </button>
      </div>

      <div className="flex items-center gap-2">
        {(['active', 'all'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === f ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'}`}
          >
            {f === 'active' ? `Needs reply${newCount ? ` (${newCount} new)` : ''}` : 'All messages'}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">Loading messages...</div>
        ) : visible.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No messages here.</div>
        ) : (
          visible.map(ticket => {
            const name = ticket.metadata?.name || ticket.email;
            const isOpen = openId === ticket.id;
            return (
              <div key={ticket.id} className="p-4 sm:p-5">
                <button
                  onClick={() => setOpenId(isOpen ? null : ticket.id)}
                  className="w-full text-left flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4"
                >
                  <span className={`self-start px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${STATUS_STYLES[ticket.status]}`}>
                    {STATUS_LABELS[ticket.status]}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold text-gray-900 truncate">{ticket.subject}</span>
                    <span className="block text-sm text-gray-500 truncate">
                      {name} · {ticket.category === 'contact' ? 'Contact form' : 'Support request'} · #{ticket.ticket_number}
                    </span>
                  </span>
                  <span className="text-sm text-gray-500 whitespace-nowrap">
                    {new Date(ticket.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </button>

                {isOpen && (
                  <div className="mt-4 sm:pl-2 space-y-4">
                    <p className="text-gray-800 whitespace-pre-wrap break-words">{ticket.description || '(no message)'}</p>
                    {ticket.metadata?.order_number && (
                      <p className="text-sm text-gray-600">Order: {ticket.metadata.order_number}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={`mailto:${ticket.email}?subject=${encodeURIComponent('Re: ' + ticket.subject)}`}
                        className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg text-sm font-semibold"
                      >
                        <i className="ri-reply-line mr-1"></i>
                        Reply by email
                      </a>
                      <select
                        value={ticket.status}
                        disabled={savingId === ticket.id}
                        onChange={e => setStatus(ticket, e.target.value as Ticket['status'])}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                        aria-label="Message status"
                      >
                        {Object.entries(STATUS_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
