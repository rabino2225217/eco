// Vercel serverless function wrapper for React Router v7 SSR
// This handles Server-Side Rendering on Vercel
// Your API calls still go to Railway via VITE_API_URL
type VercelRequest = {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: any;
};

type VercelResponse = {
  status: (code: number) => VercelResponse;
  setHeader: (name: string, value: string | number | string[]) => void;
  write: (chunk: Buffer) => boolean;
  end: (chunk?: any) => void;
  json: (body: any) => void;
};

// Use dynamic import to load the server module
let entryModule: { entry: (request: Request, init?: ResponseInit) => Promise<Response> } | null = null;

async function getEntry() {
  if (!entryModule) {
    // In Vercel, the working directory is the root directory (frontend)
    // The build output is at build/server/index.js
    // From api/index.ts, we go up one level to reach the root, then into build/server/index.js
    // @ts-expect-error - Build output is JS, not TS
    entryModule = await import("../build/server/index.js");
    
    if (!entryModule || typeof entryModule.entry !== 'function') {
      console.error("Entry module:", entryModule);
      console.error("Entry type:", typeof entryModule?.entry);
      throw new Error(`entry is not a function. Got: ${typeof entryModule?.entry}. Make sure the build completed successfully.`);
    }
  }
  
  return entryModule.entry;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // Get the entry function
    const entry = await getEntry();

    // Construct the full URL
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host;
    const url = new URL(req.url || '/', `${protocol}://${host}`);
    
    // Create a Request object from Vercel's req
    const request = new Request(url, {
      method: req.method,
      headers: new Headers(req.headers as Record<string, string>),
      body: req.method !== "GET" && req.method !== "HEAD" && req.body 
        ? (typeof req.body === 'string' ? req.body : JSON.stringify(req.body))
        : undefined,
    });

    // Call React Router's entry handler for SSR
    const response = await entry(request, {
      status: 200,
      headers: new Headers(),
    });

    // Copy response headers to Vercel response
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    // Set status code
    res.status(response.status);

    // Handle response body
    if (response.body) {
      // For streaming responses
      const reader = response.body.getReader();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        if (value) {
          res.write(Buffer.from(value));
        }
      }
    }

    res.end();
  } catch (error) {
    console.error("Error in React Router handler:", error);
    console.error("Error stack:", error instanceof Error ? error.stack : String(error));
    res.status(500).json({ 
      error: "Internal Server Error", 
      message: error instanceof Error ? error.message : String(error) 
    });
  }
}


