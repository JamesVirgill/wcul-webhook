import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Only POST requests allowed'
    });
  }

  try {
    const {
      id,
      raw_subject,
      processed_at_iso8601
    } = req.body;

    if (!raw_subject || !id || !processed_at_iso8601) {
      return res.status(400).json({
        error: 'Missing required fields'
      });
    }

    const subject = String(raw_subject).trim();
    const subjectLower = subject.toLowerCase();

    // Check NOT SOLVED first because it also contains the word "solved".
    const isNotSolved =
      subjectLower.includes('[not solved]') ||
      subjectLower.includes('not solved');

    const isSolved =
      !isNotSolved &&
      (
        subjectLower.includes('[solved]') ||
        subjectLower.includes('cleared') ||
        subjectLower.includes('resolved')
      );

    // SOLVED = green. NOT SOLVED and all other alerts = red.
    const finalStatus = isSolved ? 'ok' : 'error';

    const locationMatch = subject.match(
      /connect alert\s*-\s*([^:]+)\s*:/i
    );

    const location =
      locationMatch?.[1]?.trim() || 'Unknown Location';

    console.log('Raw subject:', subject);
    console.log('Location:', location);
    console.log('Not solved email:', isNotSolved);
    console.log('Solved email:', isSolved);
    console.log('Final status:', finalStatus);

    const { data, error } = await supabase
      .from('kiosks')
      .upsert(
        [
          {
            id,
            location,
            status: finalStatus,
            timestamp: processed_at_iso8601
          }
        ],
        {
          onConflict: 'location'
        }
      )
      .select();

    if (error) {
      console.error('Supabase upsert error:', error);

      return res.status(500).json({
        error: error.message || 'Failed to update status'
      });
    }

    return res.status(200).json({
      success: true,
      location,
      status: finalStatus,
      solved: isSolved,
      notSolved: isNotSolved,
      data
    });
  } catch (err: any) {
    console.error('Unexpected error:', err);

    return res.status(500).json({
      error: err.message || 'Server error'
    });
  }
}
