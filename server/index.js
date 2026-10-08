import { createHmac, randomBytes, scryptSync, timingSafeEqual, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import express from 'express'
import multer from 'multer'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'

const port = Number(process.env.PORT || process.env.API_PORT || 3001)
const host = process.env.HOST || (process.env.PORT ? '0.0.0.0' : '127.0.0.1')
const root = process.cwd()
const dataDirectory = resolve(process.env.DATA_DIR || join(root, 'data'))
const uploadDirectory = join(dataDirectory, 'uploads')
mkdirSync(uploadDirectory, { recursive: true })

const database = new DatabaseSync(join(dataDirectory, 'siteform.sqlite'))
database.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    location TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    contact_number TEXT NOT NULL DEFAULT '',
    whatsapp_number TEXT NOT NULL DEFAULT '',
    logo_file TEXT,
    cover_file TEXT,
    layout_file TEXT NOT NULL,
    layout_width REAL NOT NULL,
    layout_height REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
    colors_json TEXT NOT NULL DEFAULT '{}',
    layout_json TEXT NOT NULL DEFAULT '{"objects":[],"layers":{},"settings":{}}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS plots (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    plot_number TEXT NOT NULL,
    block TEXT NOT NULL DEFAULT '',
    area REAL NOT NULL DEFAULT 0,
    area_unit TEXT NOT NULL DEFAULT 'sq yd',
    width REAL NOT NULL DEFAULT 0,
    length REAL NOT NULL DEFAULT 0,
    facing TEXT NOT NULL DEFAULT '',
    road_width TEXT NOT NULL DEFAULT '',
    price REAL NOT NULL DEFAULT 0,
    price_per_unit REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('AVAILABLE', 'RESERVED', 'SOLD', 'HOLD', 'BLOCKED')),
    description TEXT NOT NULL DEFAULT '',
    coordinates_json TEXT NOT NULL,
    label_position_json TEXT,
    images_json TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, plot_number)
  );
  CREATE INDEX IF NOT EXISTS plots_project_status ON plots(project_id, status);
`)

const secretPath = join(dataDirectory, 'session-secret')
let sessionSecret = process.env.SESSION_SECRET
if (!sessionSecret) {
  try {
    sessionSecret = readFileSync(secretPath, 'utf8')
  } catch {
    sessionSecret = randomBytes(48).toString('hex')
    writeFileSync(secretPath, sessionSecret, { mode: 0o600, flag: 'wx' })
  }
}

const app = express()
app.disable('x-powered-by')
app.get('/api/health', (_request, response) => response.json({ status: 'ok' }))
app.use(express.json({ limit: '2mb' }))
app.use(express.urlencoded({ extended: false, limit: '2mb' }))

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter(_request, file, callback) {
    const extension = extname(file.originalname).toLowerCase()
    callback(null, ['.png', '.jpg', '.jpeg', '.webp', '.svg'].includes(extension))
  },
})

const statusValues = new Set(['AVAILABLE', 'RESERVED', 'SOLD', 'HOLD', 'BLOCKED'])
const allowedSvgElements = new Set(['svg', 'g', 'path', 'polygon', 'polyline', 'rect', 'circle', 'ellipse', 'line', 'text', 'tspan', 'defs', 'clipPath', 'linearGradient', 'radialGradient', 'stop'])
const allowedSvgAttributes = new Set(['xmlns', 'width', 'height', 'viewBox', 'preserveAspectRatio', 'version', 'id', 'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-opacity', 'opacity', 'transform', 'd', 'points', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'clip-path', 'font-size', 'font-family', 'font-weight', 'text-anchor', 'offset', 'stop-color', 'stop-opacity', 'gradientUnits', 'gradientTransform'])

function hasAdmin(request) {
  const value = request.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith('siteform_admin='))?.slice('siteform_admin='.length)
  if (!value) return false
  const [expires, signature] = value.split('.')
  if (!expires || !signature || Number(expires) < Date.now()) return false
  const expected = createHmac('sha256', sessionSecret).update(expires).digest('hex')
  const providedBytes = Buffer.from(signature)
  const expectedBytes = Buffer.from(expected)
  return providedBytes.length === expectedBytes.length && timingSafeEqual(providedBytes, expectedBytes) && Boolean(database.prepare('SELECT 1 FROM admins WHERE id = 1').get())
}

function requireAdmin(request, response, next) {
  if (!hasAdmin(request)) return response.status(401).json({ error: 'Administrator sign-in required.' })
  next()
}

function issueSession(response) {
  const expires = String(Date.now() + 8 * 60 * 60 * 1000)
  const signature = createHmac('sha256', sessionSecret).update(expires).digest('hex')
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  response.setHeader('Set-Cookie', `siteform_admin=${expires}.${signature}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure}`)
}

function slugify(value) {
  return String(value ?? '').trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)
}

function safeProject(row) {
  if (!row) return null
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    location: row.location,
    description: row.description,
    contactNumber: row.contact_number,
    whatsappNumber: row.whatsapp_number,
    layoutWidth: row.layout_width,
    layoutHeight: row.layout_height,
    layoutUrl: `/api/projects/${row.slug}/layout-asset`,
    status: row.status,
    colors: JSON.parse(row.colors_json),
    layout: JSON.parse(row.layout_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function projectBySlug(slug) {
  return database.prepare('SELECT * FROM projects WHERE slug = ?').get(slug)
}

function projectById(id) {
  return database.prepare('SELECT * FROM projects WHERE id = ?').get(id)
}

function validDimensions(width, height) {
  return Number.isFinite(width) && Number.isFinite(height) && width >= 1 && height >= 1 && width <= 10000 && height <= 10000 && width * height <= 50000000
}

function sanitizeSvg(buffer) {
  const parser = new DOMParser({ onError: (level, message) => { if (level === 'error' || level === 'fatalError') throw new Error(message) } })
  const document = parser.parseFromString(buffer.toString('utf8'), 'image/svg+xml')
  const rootElement = document.documentElement
  if (!rootElement || rootElement.localName !== 'svg') throw new Error('The SVG file is invalid.')
  function clean(element) {
    for (const child of Array.from(element.childNodes)) {
      if (child.nodeType === 1) {
        if (!allowedSvgElements.has(child.localName)) {
          element.removeChild(child)
          continue
        }
        clean(child)
      } else if (child.nodeType !== 3 && child.nodeType !== 4) {
        element.removeChild(child)
      }
    }
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name
      if (!allowedSvgAttributes.has(name) || name.toLowerCase().startsWith('on') || /url\s*\(/i.test(attribute.value) && !attribute.value.startsWith('url(#')) element.removeAttribute(name)
    }
  }
  clean(rootElement)
  return Buffer.from(new XMLSerializer().serializeToString(rootElement))
}

function validateLayoutFile(file, width, height) {
  if (!file) throw new Error('Upload a base layout image.')
  if (!validDimensions(width, height)) throw new Error('Layout dimensions are invalid or too large.')
  const extension = extname(file.originalname).toLowerCase()
  if (extension === '.svg') return { buffer: sanitizeSvg(file.buffer), extension: '.svg' }
  const png = file.buffer.length >= 8 && file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  const jpeg = file.buffer.length >= 3 && file.buffer[0] === 0xff && file.buffer[1] === 0xd8 && file.buffer[2] === 0xff
  const webp = file.buffer.length >= 12 && file.buffer.toString('ascii', 0, 4) === 'RIFF' && file.buffer.toString('ascii', 8, 12) === 'WEBP'
  const valid = extension === '.png' ? png : extension === '.jpg' || extension === '.jpeg' ? jpeg : extension === '.webp' ? webp : false
  if (!valid) throw new Error('The uploaded file contents do not match a supported image type.')
  return { buffer: file.buffer, extension }
}

function saveLayoutFile(file, width, height) {
  const validated = validateLayoutFile(file, Number(width), Number(height))
  const filename = `${randomUUID()}${validated.extension}`
  writeFileSync(join(uploadDirectory, filename), validated.buffer, { flag: 'wx' })
  return filename
}

function normalizedPoints(value, minimum = 3) {
  return Array.isArray(value) && value.length >= minimum && value.length <= 100 && value.every((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1)
}

function readPlots(projectId) {
  return database.prepare('SELECT * FROM plots WHERE project_id = ? ORDER BY plot_number').all(projectId).map((row) => ({
    id: row.id,
    plotNumber: row.plot_number,
    block: row.block,
    area: row.area,
    areaUnit: row.area_unit,
    width: row.width,
    length: row.length,
    facing: row.facing,
    roadWidth: row.road_width,
    price: row.price,
    pricePerUnit: row.price_per_unit,
    status: row.status,
    description: row.description,
    coordinates: JSON.parse(row.coordinates_json),
    labelPosition: row.label_position_json ? JSON.parse(row.label_position_json) : null,
    images: JSON.parse(row.images_json),
  }))
}

function validatePlot(plot) {
  return plot && typeof plot.id === 'string' && plot.id.length <= 80
    && typeof plot.plotNumber === 'string' && plot.plotNumber.trim().length > 0 && plot.plotNumber.length <= 50
    && statusValues.has(plot.status)
    && normalizedPoints(plot.coordinates)
    && ['area', 'width', 'length', 'price', 'pricePerUnit'].every((key) => Number.isFinite(Number(plot[key] ?? 0)) && Number(plot[key] ?? 0) >= 0)
    && ['block', 'areaUnit', 'facing', 'roadWidth', 'description'].every((key) => String(plot[key] ?? '').length <= 2000)
}

function validateLayout(layout) {
  if (!layout || !Array.isArray(layout.objects) || layout.objects.length > 2000) return false
  if (!layout.objects.every((object) => object && typeof object.id === 'string' && ['road', 'amenity', 'label'].includes(object.kind))) return false
  return layout.objects.every((object) => object.kind === 'road'
    ? normalizedPoints(object.points, 2)
    : Number.isFinite(object.x) && Number.isFinite(object.y) && object.x >= 0 && object.x <= 1 && object.y >= 0 && object.y <= 1)
}

app.get('/api/auth/status', (_request, response) => {
  response.json({ authenticated: hasAdmin(_request), setupRequired: !database.prepare('SELECT 1 FROM admins WHERE id = 1').get() })
})

app.post('/api/auth/setup', (request, response) => {
  if (database.prepare('SELECT 1 FROM admins WHERE id = 1').get()) return response.status(409).json({ error: 'Administrator setup is already complete.' })
  const password = String(request.body.password ?? '')
  if (password.length < 12 || password.length > 200) return response.status(400).json({ error: 'Choose a password between 12 and 200 characters.' })
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  database.prepare('INSERT INTO admins (id, salt, password_hash) VALUES (1, ?, ?)').run(salt, hash)
  issueSession(response)
  response.json({ authenticated: true })
})

app.post('/api/auth/login', (request, response) => {
  const admin = database.prepare('SELECT * FROM admins WHERE id = 1').get()
  if (!admin) return response.status(409).json({ error: 'Complete administrator setup first.' })
  const password = String(request.body.password ?? '')
  const actual = scryptSync(password, admin.salt, 64)
  const expected = Buffer.from(admin.password_hash, 'hex')
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return response.status(401).json({ error: 'Password is not correct.' })
  issueSession(response)
  response.json({ authenticated: true })
})

app.post('/api/auth/logout', (_request, response) => {
  response.setHeader('Set-Cookie', 'siteform_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0')
  response.json({ authenticated: false })
})

app.get('/api/projects', requireAdmin, (_request, response) => {
  response.json(database.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all().map(safeProject))
})

app.post('/api/projects', requireAdmin, upload.single('layout'), (request, response) => {
  const name = String(request.body.name ?? '').trim()
  const slug = slugify(request.body.slug || name)
  if (!name || name.length > 140 || !slug) return response.status(400).json({ error: 'Project name and a valid slug are required.' })
  const layoutFile = saveLayoutFile(request.file, request.body.layoutWidth, request.body.layoutHeight)
  const project = {
    id: randomUUID(), slug, name,
    location: String(request.body.location ?? '').slice(0, 240),
    description: String(request.body.description ?? '').slice(0, 4000),
    contactNumber: String(request.body.contactNumber ?? '').slice(0, 40),
    whatsappNumber: String(request.body.whatsappNumber ?? '').slice(0, 40),
    layoutFile,
    layoutWidth: Number(request.body.layoutWidth),
    layoutHeight: Number(request.body.layoutHeight),
  }
  try {
    database.prepare(`INSERT INTO projects (id, slug, name, location, description, contact_number, whatsapp_number, layout_file, layout_width, layout_height)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(project.id, project.slug, project.name, project.location, project.description, project.contactNumber, project.whatsappNumber, project.layoutFile, project.layoutWidth, project.layoutHeight)
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return response.status(409).json({ error: 'That project slug is already in use.' })
    throw error
  }
  response.status(201).json(safeProject(projectById(project.id)))
})

app.get('/api/projects/id/:id', requireAdmin, (request, response) => {
  const row = projectById(request.params.id)
  if (!row) return response.status(404).json({ error: 'Project not found.' })
  response.json(safeProject(row))
})

app.put('/api/projects/:slug', requireAdmin, (request, response) => {
  const row = projectBySlug(request.params.slug)
  if (!row) return response.status(404).json({ error: 'Project not found.' })
  const name = String(request.body.name ?? row.name).trim()
  const slug = slugify(request.body.slug ?? row.slug)
  if (!name || name.length > 140 || !slug) return response.status(400).json({ error: 'Project name and slug are required.' })
  const status = ['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(request.body.status) ? request.body.status : row.status
  try {
    database.prepare(`UPDATE projects SET slug = ?, name = ?, location = ?, description = ?, contact_number = ?, whatsapp_number = ?, colors_json = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(slug, name, String(request.body.location ?? row.location).slice(0, 240), String(request.body.description ?? row.description).slice(0, 4000), String(request.body.contactNumber ?? row.contact_number).slice(0, 40), String(request.body.whatsappNumber ?? row.whatsapp_number).slice(0, 40), JSON.stringify(request.body.colors ?? JSON.parse(row.colors_json)), status, row.id)
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return response.status(409).json({ error: 'That project slug is already in use.' })
    throw error
  }
  response.json(safeProject(projectById(row.id)))
})

app.get('/api/projects/:slug', (request, response) => {
  const row = projectBySlug(request.params.slug)
  const preview = request.query.preview === '1' && hasAdmin(request)
  if (!row || (row.status !== 'PUBLISHED' && !preview && !hasAdmin(request))) return response.status(404).json({ error: 'Published project not found.' })
  response.json(safeProject(row))
})

app.get('/api/projects/:slug/layout', (request, response) => {
  const row = projectBySlug(request.params.slug)
  if (!row || (row.status !== 'PUBLISHED' && !hasAdmin(request))) return response.status(404).json({ error: 'Layout not found.' })
  response.json({ width: row.layout_width, height: row.layout_height, layout: JSON.parse(row.layout_json) })
})

app.put('/api/projects/:slug/layout', requireAdmin, (request, response) => {
  const row = projectBySlug(request.params.slug)
  if (!row) return response.status(404).json({ error: 'Project not found.' })
  if (!validateLayout(request.body)) return response.status(400).json({ error: 'Layout geometry is invalid.' })
  database.prepare('UPDATE projects SET layout_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(JSON.stringify(request.body), row.id)
  response.json({ saved: true })
})

app.put('/api/projects/:slug/layout-image', requireAdmin, upload.single('layout'), (request, response) => {
  const row = projectBySlug(request.params.slug)
  if (!row) return response.status(404).json({ error: 'Project not found.' })
  const filename = saveLayoutFile(request.file, request.body.layoutWidth, request.body.layoutHeight)
  database.prepare('UPDATE projects SET layout_file = ?, layout_width = ?, layout_height = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(filename, Number(request.body.layoutWidth), Number(request.body.layoutHeight), row.id)
  response.json(safeProject(projectById(row.id)))
})

app.get('/api/projects/:slug/layout-asset', (request, response) => {
  const row = projectBySlug(request.params.slug)
  if (!row || (row.status !== 'PUBLISHED' && !hasAdmin(request))) return response.status(404).end()
  const filename = join(uploadDirectory, row.layout_file)
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('Cache-Control', 'private, max-age=300')
  response.type(extname(row.layout_file) === '.svg' ? 'image/svg+xml' : extname(row.layout_file).slice(1))
  response.sendFile(filename)
})

app.get('/api/projects/:slug/plots', (request, response) => {
  const row = projectBySlug(request.params.slug)
  if (!row || (row.status !== 'PUBLISHED' && !hasAdmin(request))) return response.status(404).json({ error: 'Project not found.' })
  response.json(readPlots(row.id))
})

app.put('/api/projects/:slug/plots', requireAdmin, (request, response) => {
  const row = projectBySlug(request.params.slug)
  if (!row) return response.status(404).json({ error: 'Project not found.' })
  const plots = request.body.plots
  if (!Array.isArray(plots) || plots.length > 5000 || !plots.every(validatePlot)) return response.status(400).json({ error: 'Plot data or normalized coordinates are invalid.' })
  const transaction = database.prepare('DELETE FROM plots WHERE project_id = ?')
  const insert = database.prepare(`INSERT INTO plots (id, project_id, plot_number, block, area, area_unit, width, length, facing, road_width, price, price_per_unit, status, description, coordinates_json, label_position_json, images_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  database.exec('BEGIN IMMEDIATE')
  try {
    transaction.run(row.id)
    for (const plot of plots) insert.run(plot.id, row.id, plot.plotNumber, plot.block ?? '', Number(plot.area ?? 0), plot.areaUnit ?? 'sq yd', Number(plot.width ?? 0), Number(plot.length ?? 0), plot.facing ?? '', plot.roadWidth ?? '', Number(plot.price ?? 0), Number(plot.pricePerUnit ?? 0), plot.status, plot.description ?? '', JSON.stringify(plot.coordinates), plot.labelPosition ? JSON.stringify(plot.labelPosition) : null, JSON.stringify(plot.images ?? []))
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return response.status(409).json({ error: 'Plot numbers must be unique within a project.' })
    throw error
  }
  response.json({ saved: plots.length })
})

app.post('/api/projects/:slug/publish', requireAdmin, (request, response) => {
  const row = projectBySlug(request.params.slug)
  if (!row) return response.status(404).json({ error: 'Project not found.' })
  database.prepare("UPDATE projects SET status = 'PUBLISHED', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(row.id)
  response.json(safeProject(projectById(row.id)))
})

app.post('/api/projects/:slug/unpublish', requireAdmin, (request, response) => {
  const row = projectBySlug(request.params.slug)
  if (!row) return response.status(404).json({ error: 'Project not found.' })
  database.prepare("UPDATE projects SET status = 'DRAFT', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(row.id)
  response.json(safeProject(projectById(row.id)))
})

app.post('/api/projects/:slug/archive', requireAdmin, (request, response) => {
  const row = projectBySlug(request.params.slug)
  if (!row) return response.status(404).json({ error: 'Project not found.' })
  database.prepare("UPDATE projects SET status = 'ARCHIVED', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(row.id)
  response.json(safeProject(projectById(row.id)))
})

app.use('/api', (_request, response) => response.status(404).json({ error: 'API route not found.' }))
app.use((error, _request, response, _next) => {
  const message = error instanceof Error ? error.message : 'Unexpected API error.'
  const status = error instanceof multer.MulterError ? 400 : error.message === 'Layout dimensions are invalid or too large.' || error.message === 'Upload a base layout image.' || error.message === 'The uploaded file contents do not match a supported image type.' || error.message === 'The SVG file is invalid.' ? 400 : 500
  if (status === 500) console.error(error)
  response.status(status).json({ error: message })
})

app.listen(port, host, () => console.log(`Siteform API listening at http://${host}:${port}`))
