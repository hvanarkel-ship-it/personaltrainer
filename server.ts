import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

// Load environment variables
dotenv.config()

// Handlers from netlify/functions
import { handler as authLogin } from './netlify/functions/auth-login.js'
import { handler as authRegister } from './netlify/functions/auth-register.js'
import { handler as authResetConfirm } from './netlify/functions/auth-reset-confirm.js'
import { handler as authResetRequest } from './netlify/functions/auth-reset-request.js'
import { handler as coachChat } from './netlify/functions/coach-chat.js'
import { handler as dashboard } from './netlify/functions/dashboard.js'
import { handler as doelen } from './netlify/functions/doelen.js'
import { handler as health } from './netlify/functions/health.js'
import { handler as inbody } from './netlify/functions/inbody.js'
import { handler as intervalsConnect } from './netlify/functions/intervals-connect.js'
import { handler as intervalsSync } from './netlify/functions/intervals-sync.js'
import { handler as maaltijd } from './netlify/functions/maaltijd.js'
import { handler as profiel } from './netlify/functions/profiel.js'
import { handler as runalyzeConnect } from './netlify/functions/runalyze-connect.js'
import { handler as runalyzeSync } from './netlify/functions/runalyze-sync.js'
import { handler as statistieken } from './netlify/functions/statistieken.js'
import { handler as training } from './netlify/functions/training.js'
import { handler as uploadAnalyse } from './netlify/functions/upload-analyse.js'
import { handler as garminConnect } from './netlify/functions/garmin-connect.js'
import { handler as garminSync } from './netlify/functions/garmin-sync.js'

const handlers: Record<string, any> = {
  'auth-login': authLogin,
  'auth-register': authRegister,
  'auth-reset-confirm': authResetConfirm,
  'auth-reset-request': authResetRequest,
  'coach-chat': coachChat,
  'dashboard': dashboard,
  'doelen': doelen,
  'health': health,
  'inbody': inbody,
  'intervals-connect': intervalsConnect,
  'intervals-sync': intervalsSync,
  'maaltijd': maaltijd,
  'profiel': profiel,
  'runalyze-connect': runalyzeConnect,
  'runalyze-sync': runalyzeSync,
  'statistieken': statistieken,
  'training': training,
  'upload-analyse': uploadAnalyse,
  'garmin-connect': garminConnect,
  'garmin-sync': garminSync,
}

const app = express()
const PORT = 3000

app.use(cors())
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

// Bridge function to run Netlify serverless handlers in Express
async function runNetlifyHandler(handler: any, req: express.Request, res: express.Response) {
  try {
    const rawBody = req.body && Object.keys(req.body).length > 0 ? JSON.stringify(req.body) : ''
    const event = {
      httpMethod: req.method,
      path: req.originalUrl.split('?')[0],
      headers: req.headers,
      body: rawBody,
      queryStringParameters: req.query,
    }

    const response = await handler(event)

    if (response.headers) {
      for (const [key, value] of Object.entries(response.headers)) {
        res.setHeader(key, value as string)
      }
    }

    res.status(response.statusCode || 200)
    if (typeof response.body === 'string') {
      res.send(response.body)
    } else {
      res.json(response.body)
    }
  } catch (err: any) {
    console.error(`[API Error ${req.path}]`, err)
    res.status(500).json({ error: 'Serverfout: ' + (err.message || 'Onbekende fout') })
  }
}

// Route all /api endpoints
app.use('/api', async (req, res) => {
  const segments = req.path.replace(/^\//, '').split('/')
  const functionName = segments[0]

  const handler = handlers[functionName]
  if (handler) {
    await runNetlifyHandler(handler, req, res)
  } else {
    res.status(404).json({ error: `API endpoint '/api/${functionName}' niet gevonden` })
  }
})

// Setup Vite in development or static serving in production
async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production'

  if (isDev) {
    const { createServer: createViteServer } = await import('vite')
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: '0.0.0.0',
        port: PORT,
        allowedHosts: 'all' as any,
      },
      appType: 'spa',
    })
    app.use(vite.middlewares)
  } else {
    const distPath = path.resolve('dist')
    app.use(express.static(distPath))
    app.use((req, res, next) => {
      if (req.method === 'GET' && !req.path.startsWith('/api')) {
        res.sendFile(path.join(distPath, 'index.html'))
      } else {
        next()
      }
    })
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 APEX Coach server running on http://0.0.0.0:${PORT} (${isDev ? 'Development' : 'Production'})`)
  })
}

if (!process.env.VERCEL) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err)
    process.exit(1)
  })
}

export default app
export { app, handlers }
