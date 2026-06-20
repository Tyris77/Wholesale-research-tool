import { useState } from 'react';
import { askAssistant } from '../api/client';
import { Loading, ErrorBanner } from '../components/states';
import type { AssistantMessage } from '../api/types';

const SUGGESTIONS = [
  'Summarize my pipeline',
  'Which buyers fit my best deal?',
  "Who's due for follow-up?",
  'What are my hottest markets?',
];

export function Assistant() {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || loading) return;
    setError(null);
    const next: AssistantMessage[] = [...messages, { role: 'user', content: question }];
    setMessages(next);
    setInput('');
    setLoading(true);
    try {
      const res = await askAssistant(next);
      if (res.success && res.reply) {
        setMessages((m) => [...m, { role: 'assistant', content: res.reply as string }]);
      } else {
        setError(res.error || 'The assistant could not answer.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <header className="hero-panel">
        <p className="eyebrow">AI</p>
        <h1>Deal Assistant</h1>
        <p>Ask about your deals, buyers, markets, and follow-ups. The assistant reads your live pipeline.</p>
      </header>

      <div className="layout-single">
        <section className="panel">
          {messages.length === 0 && (
            <div className="chat-suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="ghost-button" onClick={() => send(s)}>{s}</button>
              ))}
            </div>
          )}

          <div className="chat-thread">
            {messages.map((m, i) => (
              <div key={i} className={`chat-bubble chat-${m.role}`}>
                <p>{m.content}</p>
              </div>
            ))}
            {loading && <Loading label="Thinking…" />}
          </div>

          {error && <ErrorBanner message={error} />}

          <form
            className="chat-input"
            onSubmit={(e) => { e.preventDefault(); send(input); }}
          >
            <input
              placeholder="Ask about your pipeline…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button type="submit" disabled={loading || !input.trim()}>Send</button>
          </form>
        </section>
      </div>
    </>
  );
}
