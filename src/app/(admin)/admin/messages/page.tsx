'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Mail, MailOpen, RefreshCw, Send, Trash2, X } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';

type ContactMessage = {
  id: string;
  name: string;
  email: string;
  message: string;
  status: 'unread' | 'read' | 'replied';
  emailStatus: 'pending' | 'sent' | 'failed' | 'unknown';
  createdAt: string | null;
  emailedAt: string | null;
};

function formatDate(value: string | null) {
  if (!value) return 'Pending timestamp';
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default function AdminMessagesPage() {
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [filter, setFilter] = useState<'all' | ContactMessage['status']>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  const loadMessages = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/contact-messages', { cache: 'no-store' });
      const data = await response.json() as { messages?: ContactMessage[]; error?: string };
      if (!response.ok) throw new Error(data.error || 'Could not load messages.');
      setMessages(data.messages || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load messages.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    fetch('/api/admin/contact-messages', { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json() as { messages?: ContactMessage[]; error?: string };
        if (!response.ok) throw new Error(data.error || 'Could not load messages.');
        if (active) setMessages(data.messages || []);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load messages.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const visibleMessages = useMemo(
    () => filter === 'all' ? messages : messages.filter((message) => message.status === filter),
    [filter, messages]
  );
  const unreadCount = messages.filter((message) => message.status === 'unread').length;

  const updateStatus = async (id: string, status: ContactMessage['status']) => {
    setBusyId(id);
    try {
      const response = await fetch(`/api/admin/contact-messages/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error('Could not update message.');
      setMessages((current) => current.map((message) => message.id === id ? { ...message, status } : message));
      window.dispatchEvent(new Event('casaio:messages-updated'));
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Could not update message.');
    } finally {
      setBusyId(null);
    }
  };

  const deleteMessage = async (id: string) => {
    if (!window.confirm('Delete this contact message?')) return;
    setBusyId(id);
    try {
      const response = await fetch(`/api/admin/contact-messages/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Could not delete message.');
      setMessages((current) => current.filter((message) => message.id !== id));
      window.dispatchEvent(new Event('casaio:messages-updated'));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not delete message.');
    } finally {
      setBusyId(null);
    }
  };

  const sendReply = async (message: ContactMessage) => {
    if (!replyText.trim()) return;
    setBusyId(message.id);
    setError('');
    try {
      const response = await fetch(`/api/admin/contact-messages/${message.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: replyText }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Could not send reply.');
      setMessages((current) => current.map((item) => item.id === message.id ? { ...item, status: 'replied' } : item));
      setReplyingId(null);
      setReplyText('');
      window.dispatchEvent(new Event('casaio:messages-updated'));
    } catch (replyError) {
      setError(replyError instanceof Error ? replyError.message : 'Could not send reply.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-orange-600">Customer care</p>
          <h1 className="mt-1 font-serif text-3xl font-bold text-zinc-950">Contact Messages</h1>
          <p className="mt-2 text-sm text-zinc-500">Messages submitted through the Casaio contact form.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void loadMessages()} disabled={loading} leftIcon={<RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />}>
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          ['Total', messages.length],
          ['Unread', unreadCount],
          ['Email delivered', messages.filter((message) => message.emailStatus === 'sent').length],
        ].map(([label, value]) => (
          <Card key={label as string}><CardContent className="p-5"><p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{label}</p><p className="mt-1 font-serif text-2xl font-bold text-zinc-950">{value}</p></CardContent></Card>
        ))}
      </div>

      <div className="flex items-center gap-2">
        {(['all', 'unread', 'read', 'replied'] as const).map((value) => (
          <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-full px-3 py-1.5 text-xs font-medium capitalize ${filter === value ? 'bg-zinc-950 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}>
            {value}
          </button>
        ))}
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {loading ? (
        <Card><CardContent className="p-12 text-center text-sm text-zinc-500">Loading messages...</CardContent></Card>
      ) : visibleMessages.length === 0 ? (
        <Card><CardContent className="p-12 text-center"><Mail className="mx-auto h-8 w-8 text-zinc-300" /><p className="mt-3 text-sm text-zinc-500">No contact messages found.</p></CardContent></Card>
      ) : (
        <div className="space-y-3">
          {visibleMessages.map((message) => (
            <Card key={message.id} className={message.status === 'unread' ? 'border-orange-200 shadow-sm' : ''}>
              <CardContent className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-zinc-950">{message.name}</h2>
                      <Badge variant={message.status === 'unread' ? 'accent' : 'secondary'} size="sm">{message.status}</Badge>
                      <span className={`text-[11px] ${message.emailStatus === 'sent' ? 'text-emerald-600' : 'text-zinc-400'}`}>Email {message.emailStatus}</span>
                    </div>
                    <p className="mt-1 text-sm text-orange-700">{message.email}</p>
                    <p className="mt-1 text-xs text-zinc-400">{formatDate(message.createdAt)}</p>
                    <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-zinc-700">{message.message}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {message.status === 'unread' && <Button size="sm" variant="outline" onClick={() => void updateStatus(message.id, 'read')} disabled={busyId === message.id} leftIcon={<MailOpen className="h-3.5 w-3.5" />}>Mark read</Button>}
                    {message.status !== 'replied' && <Button size="sm" variant="outline" onClick={() => void updateStatus(message.id, 'replied')} disabled={busyId === message.id} leftIcon={<Check className="h-3.5 w-3.5" />}>Replied</Button>}
                    {message.status !== 'replied' && (
                      <Button size="sm" variant="outline" onClick={() => { setReplyingId(message.id); setReplyText(''); }} disabled={busyId === message.id} leftIcon={<Mail className="h-3.5 w-3.5" />}>Reply</Button>
                    )}
                    <button type="button" onClick={() => void deleteMessage(message.id)} disabled={busyId === message.id} aria-label={`Delete message from ${message.name}`} className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
                {replyingId === message.id && (
                  <div className="mt-5 border-t border-zinc-100 pt-5">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Reply from Casaio</p>
                      <button type="button" onClick={() => { setReplyingId(null); setReplyText(''); }} aria-label="Close reply composer" className="rounded p-1 text-zinc-400 hover:bg-zinc-100"><X className="h-4 w-4" /></button>
                    </div>
                    <textarea value={replyText} onChange={(event) => setReplyText(event.target.value)} rows={5} maxLength={10000} placeholder="Write your reply to the customer..." className="w-full resize-y rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-orange-500" />
                    <div className="mt-2 flex justify-end">
                      <Button size="sm" variant="primary" onClick={() => void sendReply(message)} disabled={busyId === message.id || !replyText.trim()} isLoading={busyId === message.id} leftIcon={<Send className="h-3.5 w-3.5" />}>Send reply</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
