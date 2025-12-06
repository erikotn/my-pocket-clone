import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function Home() {
  const [url, setUrl] = useState('');
  const [bookmarks, setBookmarks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // Load bookmarks when the page opens
  useEffect(() => {
    fetchBookmarks();
  }, []);

  async function fetchBookmarks() {
    // Select all bookmarks, ordered by newest first
    const { data, error } = await supabase
      .from('bookmarks')
      .select('*')
      .order('id', { ascending: false });
    
    if (error) console.log('Error fetching:', error);
    if (data) setBookmarks(data);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setMessage('Saving...');
    
    try {
      const res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link: url }),
      });
      
      const json = await res.json();
      
      if (json.error) {
        setMessage('Error: ' + json.error);
      } else {
        setMessage('Saved!');
        setUrl('');
        fetchBookmarks(); // Refresh the list
      }
    } catch (err) {
      setMessage('Failed to send request.');
    }
    setLoading(false);
  }

  return (
    <div style={{ maxWidth: '600px', margin: '50px auto', fontFamily: 'sans-serif', padding: '20px' }}>
      <h1>My Pocket Clone</h1>
      
      {/* Input Form */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <input 
          type="url" 
          value={url} 
          onChange={(e) => setUrl(e.target.value)} 
          placeholder="Paste link (e.g., https://bbc.com/news...)" 
          required 
          style={{ flex: 1, padding: '10px', fontSize: '16px' }}
        />
        <button disabled={loading} style={{ padding: '10px 20px', cursor: 'pointer', fontSize: '16px' }}>
          {loading ? '...' : 'Save'}
        </button>
      </form>
      
      {message && <p style={{ fontSize: '14px', color: '#555' }}>{message}</p>}

      {/* Bookmarks List */}
      <div style={{ display: 'grid', gap: '20px' }}>
        {bookmarks.map((item) => (
          <div key={item.id} style={{ border: '1px solid #ddd', padding: '15px', borderRadius: '8px', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' }}>
            {item.image && (
              <img 
                src={item.image} 
                alt={item.title}
                style={{ width: '100%', height: '200px', objectFit: 'cover', borderRadius: '4px', marginBottom: '10px' }} 
              />
            )}
            <h3 style={{ margin: '0 0 10px 0' }}>
              <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: '#0070f3' }}>
                {item.title || item.url}
              </a>
            </h3>
            {item.summary && <p style={{ margin: 0, color: '#666', lineHeight: '1.5' }}>{item.summary}</p>}
          </div>
        ))}
        {bookmarks.length === 0 && <p>No bookmarks yet.</p>}
      </div>
    </div>
  );
}
