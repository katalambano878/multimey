'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type Ticket = {
  id: string;
  ticket_number: number | string;
  subject: string;
  category: string | null;
  priority: string | null;
  status: string | null;
  created_at: string;
  updated_at: string | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  order: 'Order Issue',
  delivery: 'Delivery Problem',
  return: 'Return Request',
  payment: 'Payment Issue',
  product: 'Product Question',
  account: 'Account Help',
  other: 'Other',
};

const FILTERS = [
  { value: 'all', label: 'All Tickets' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
];

function formatDate(value: string | null) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function MyTicketsPage() {
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setSignedIn(false);
        setLoading(false);
        return;
      }
      setSignedIn(true);
      const { data, error } = await supabase
        .from('support_tickets')
        .select('id, ticket_number, subject, category, priority, status, created_at, updated_at')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });
      if (error) {
        console.error('Failed to load tickets:', error);
        setLoadError('We could not load your tickets. Please try again later.');
      } else {
        setTickets((data as Ticket[]) || []);
      }
      setLoading(false);
    }
    load();
  }, []);

  // "Resolved" also covers closed tickets
  const matchesFilter = (ticket: Ticket, filter: string) => {
    if (filter === 'all') return true;
    if (filter === 'resolved') return ticket.status === 'resolved' || ticket.status === 'closed';
    if (filter === 'in_progress') return ticket.status === 'in_progress' || ticket.status === 'waiting_customer';
    return ticket.status === filter;
  };

  const filteredTickets = tickets.filter((t) => matchesFilter(t, selectedFilter));

  const getStatusColor = (status: string | null) => {
    switch (status) {
      case 'open': return 'bg-blue-100 text-blue-700';
      case 'in_progress':
      case 'waiting_customer': return 'bg-amber-100 text-amber-700';
      case 'resolved':
      case 'closed': return 'bg-gray-100 text-gray-900';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getPriorityColor = (priority: string | null) => {
    switch (priority) {
      case 'urgent':
      case 'high': return 'text-red-700';
      case 'medium': return 'text-blue-700';
      default: return 'text-gray-700';
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center py-12">
        <i className="ri-loader-4-line text-3xl text-gray-500 animate-spin"></i>
      </main>
    );
  }

  if (!signedIn) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center py-12">
        <div className="max-w-md mx-auto px-4 text-center">
          <div className="bg-white rounded-xl shadow-sm p-8">
            <div className="w-16 h-16 flex items-center justify-center bg-gray-100 rounded-full mx-auto mb-6">
              <i className="ri-lock-line text-3xl text-gray-900"></i>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-3">Sign in to see your tickets</h1>
            <p className="text-gray-600 mb-6">Your support tickets are linked to your account.</p>
            <Link
              href="/auth/login?redirect=/support/tickets"
              className="block bg-gray-900 hover:bg-gray-800 text-white py-3 rounded-lg font-semibold transition-colors whitespace-nowrap"
            >
              Sign In
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between gap-4 mb-8 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">My Support Tickets</h1>
            <p className="text-gray-600">Track your support requests</p>
          </div>
          <Link
            href="/support/ticket"
            className="bg-gray-900 hover:bg-gray-800 text-white px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap"
          >
            <i className="ri-add-line mr-2"></i>
            New Ticket
          </Link>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6">
          <div className="flex border-b border-gray-200 overflow-x-auto">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setSelectedFilter(f.value)}
                className={`px-6 py-4 font-semibold whitespace-nowrap border-b-2 transition-colors ${
                  selectedFilter === f.value
                    ? 'border-gray-900 text-gray-900'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                {f.label} ({tickets.filter((t) => matchesFilter(t, f.value)).length})
              </button>
            ))}
          </div>
        </div>

        {loadError && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-6 text-sm">{loadError}</div>
        )}

        {filteredTickets.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center">
            <div className="w-20 h-20 flex items-center justify-center bg-gray-100 rounded-full mx-auto mb-6">
              <i className="ri-ticket-line text-4xl text-gray-400"></i>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">No tickets found</h2>
            <p className="text-gray-600 mb-6">
              {tickets.length === 0 ? "You don't have any support tickets yet" : 'No tickets match this filter'}
            </p>
            <Link
              href="/support/ticket"
              className="inline-block bg-gray-900 hover:bg-gray-800 text-white px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap"
            >
              Create a Ticket
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredTickets.map((ticket) => (
              <div key={ticket.id} className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <h3 className="text-xl font-bold text-gray-900">{ticket.subject}</h3>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${getStatusColor(ticket.status)}`}>
                        {(ticket.status || 'open').replace(/_/g, ' ').toUpperCase()}
                      </span>
                    </div>
                    <p className="text-gray-600 mb-3">
                      {CATEGORY_LABELS[ticket.category || ''] || ticket.category || 'General'} • Ticket #{ticket.ticket_number}
                    </p>
                    <div className="flex items-center gap-6 text-sm text-gray-500 flex-wrap">
                      <div className="flex items-center space-x-2">
                        <i className="ri-calendar-line"></i>
                        <span>Created {formatDate(ticket.created_at)}</span>
                      </div>
                      {ticket.updated_at && (
                        <div className="flex items-center space-x-2">
                          <i className="ri-time-line"></i>
                          <span>Updated {formatDate(ticket.updated_at)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className={`flex items-center space-x-1 font-semibold ${getPriorityColor(ticket.priority)}`}>
                    <i className={`ri-flag-${ticket.priority === 'high' || ticket.priority === 'urgent' ? 'fill' : 'line'}`}></i>
                    <span className="capitalize">{ticket.priority || 'medium'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
