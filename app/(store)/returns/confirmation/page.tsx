import { redirect } from 'next/navigation';

// Returns are requested over WhatsApp (see /returns); there is no online
// submission step, so this old confirmation URL just points back there.
export default function ReturnConfirmationPage() {
  redirect('/returns');
}
