import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function Home() {
  const [url, setUrl] = useState('');
  const [tags, setTags] = useState('');
  const [password, setPassword] = useState(''); 
  const [filter, setFilter] = useState('');
  const [bookmarks, setBookmarks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchBookmarks();
  }, []);

  async function fetchBookmarks() {
    const { data } = await supabase.from('bookmarks').select('*').order('id', { ascending: false });
    if (data) setBookmarks(data);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setMessage('Saving...');

    try {
      // We send the password to the server to be checked there
      const res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link: url, tags: tags, password: password }),
      });

      const json = await res.json();

      if (json.error) {
        setMessage('❌ ' + json.error);
      } else {
        setMessage('✅ Saved!');
        setUrl('');
        setTags('');
        fetchBookmarks(); 
      }
    } catch (err) {
      setMessage('Failed to send request.');
    }
    setLoading(false);
  }

  async function handleDelete(id) {
    if (!confirm('Delete this?')) return;

    const res = await fetch('/api/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id, password: password }),
    });

    const json = await res.json();
    if (json.error) {
      alert("❌ " + json.error);
    } else {
      fetchBookmarks();
    }
  }

  const filteredBookmarks = bookmarks.filter(item => {
    if (!filter) return true;
    const tagMatch = item.tags && item.tags.toLowerCase().includes(filter.toLowerCase());
    const titleMatch = item.title && item.title.toLowerCase().includes(filter.toLowerCase());
    return tagMatch || titleMatch;
  });

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', fontFamily: 'sans-serif', padding: '20px' }}>

      <div style={{ marginBottom: '40px', textAlign: 'center' }}>
        <h1>My Secure Pocket</h1>

        {/* ADMIN BAR */}
        <div style={{ backgroundColor: '#f9f9f9', padding: '15px', borderRadius: '8px', maxWidth: '800px', margin: '0 auto 20px auto', border: '1px solid #eee' }}>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '10px' }}>
             <input 
               type="password" 
               value={password}
               onChange={(e) => setPassword(e.target.value)}
               placeholder="Admin Password..."
               style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc', width: '200px'}}
             />
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <input 
              type="url" 
              value={url} 
              onChange={(e) => setUrl(e.target.value)} 
              placeholder="Paste link..." 
              required 
              style={{ flex: 2, minWidth: '200px', padding: '12px', borderRadius: '5px', border: '1px solid #ccc' }}
            />
            <input 
              type="text" 
              value={tags} 
              onChange={(e) => setTags(e.target.value)} 
              placeholder="Tags" 
              style={{ flex: 1, minWidth: '100px', padding: '12px', borderRadius: '5px', border: '1px solid #ccc' }}
            />
            <button disabled={loading} style={{ padding: '12px 25px', backgroundColor: 'black', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
              {loading ? '...' : 'Save'}
            </button>
          </form>
          {message && <p style={{ color: message.includes('❌') ? 'red' : 'green', marginTop: '10px', fontWeight: 'bold' }}>{message}</p>}
        </div>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <input 
          type="text" 
          placeholder="🔍 Filter..." 
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ddd' }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
        {filteredBookmarks.map((item) => (
          <div key={item.id} style={{ border: '1px solid #eee', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ height: '180px', backgroundColor: '#f0f0f0', overflow: 'hidden' }}>
              {item.image ? <img src={item.image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
            </div>
            <div style={{ padding: '15px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                <h3 style={{ fontSize: '18px', margin: '0 0 8px 0' }}><a href={item.url} target="_blank" style={{ textDecoration: 'none', color: '#333' }}>{item.title || 'Untitled'}</a></h3>
                {item.tags && <span style={{ backgroundColor: '#f0f0f0', padding: '3px 8px', borderRadius: '4px', fontSize: '12px', color: '#555', marginBottom: '10px', alignSelf: 'flex-start' }}>#{item.tags}</span>}
                <button onClick={() => handleDelete(item.id)} style={{ marginTop: 'auto', padding: '8px', background: 'none', border: '1px solid #ff4444', color: '#ff4444', borderRadius: '4px', cursor: 'pointer' }}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
