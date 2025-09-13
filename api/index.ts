import type { VercelRequest, VercelResponse } from '@vercel/node';

// Basic API endpoint for PK_PD_SIM
// This serves as a catch-all endpoint for API requests
export default function handler(req: VercelRequest, res: VercelResponse) {
  const { method, url } = req;
  
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Simple health check endpoint
  if (method === 'GET' && url === '/api') {
    return res.status(200).json({ 
      message: 'PK_PD_SIM API is running',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    });
  }
  
  // Handle other API routes
  res.status(404).json({ 
    error: 'API endpoint not found',
    method,
    url
  });
}
