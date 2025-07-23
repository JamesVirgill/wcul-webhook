import { createClient } from '@supabase/supabase-js'

// Initialize Supabase client
const supabase = createClient(
  'https://uhokqclbxoevlxrzeinf.supabase.co',
  process.env.SUPABASE_KEY!
)

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { mail_subject, status } = req.body

  // Extract location name before colon
  const [locationRaw] = mail_subject.split(':')
  const location = locationRaw.trim()

  // Send to Supabase table 'kiosks'
  const { error } = await supabase
    .from('kiosks')
    .upsert({ location, status })

  if (error) {
    console.error('Supabase error:', error)
    return res.status(500).json({ error: 'Failed to update status' })
  }

  res.status(200).json({ success: true })
}
