import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = 'https://uhokqclbxoevlxrzeinf.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey || '');

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  try {
    const { raw_subject, status, id, processed_at_iso8601 } = req.body;

    if (!raw_subject || !status || !id || !processed_at_iso8601) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Define possible locations and matching strings
    const locationMap: Record<string, string> = {
      "Smitty's": "Smitty's Sandyport",
      'Rubis': 'Rubis East St and Soldier Rd',
      'Quality Home Center': 'Quality Home Center Prince Charles',
      'QHC Carmichael': 'Quality Home Center Carmichael'
    };

    // Find location from subject
    const matchedKey = Object.keys(locationMap).find(key =>
      raw_subject.includes(key)
    );

    if (!matchedKey) {
      return res.status(400).json({ error: 'Unable to determine location from subject' });
    }

    const location = locationMap[matchedKey];

    const { error } = await supabase
      .from('kiosks')
      .upsert({
        id,
        location,
        status,
        timestamp: processed_at_iso8601
      }, { onConflict: ['location'] });

    if (error) {
      console.error('Supabase insert error:', error);
      return res.status(500).json({ error: 'Failed to update status' });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

