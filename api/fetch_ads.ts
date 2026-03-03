import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { domain } = req.query;

  if (!domain || typeof domain !== 'string') {
    return res.status(400).json({ error: "Domain is required" });
  }

  // 确保域名格式正确，去掉可能的 http/https 前缀
  const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const targetUrl = `https://${cleanDomain}/ads.txt`;
  
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/plain',
  };

  try {
    const response = await fetch(targetUrl, { 
      headers, 
      signal: AbortSignal.timeout(8000) // 设置 8 秒超时
    });
    
    const text = await response.text();
    
    if (response.ok) {
      return res.status(200).json({ status: 200, content: text });
    }
    
    return res.status(response.status).json({ error: `HTTP ${response.status}` });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
