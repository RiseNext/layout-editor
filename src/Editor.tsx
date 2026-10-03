import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { ArrowLeft, ArrowRight, Check, Compass, Eye, EyeOff, FileImage, Lock, LockKeyhole, MapPin, Maximize2, MousePointer2, Move, Pencil, Plus, Redo2, Ruler, Save, Shapes, Trash2, Undo2, Upload, ZoomIn, ZoomOut } from 'lucide-react'
import { api, jsonRequest, saveLayout, savePlots } from './api'
import { clampPoint, pathFromPoints, polygonInteriorPoint } from './geometry'
import { defaultColors, defaultLayers, emptyLayout, statusLabels, type AmenityObject, type LabelObject, type LayoutDocument, type LayoutObject, type LayerName, type Plot, type PlotStatus, type Point, type Project, type RoadObject } from './types'

type Tool = 'select' | 'plot' | 'edit' | 'road' | 'amenity' | 'label' | 'measure'
type Snapshot = { plots: Plot[]; layout: LayoutDocument }
type Drag = { kind: 'pan'; clientX: number; clientY: number; view: ViewBox } | { kind: 'plot' | 'vertex' | 'object'; id: string; index?: number; start: Point; before: Snapshot }
type DragKind = Exclude<Drag['kind'], 'pan'>
type ViewBox = { x: number; y: number; width: number; height: number }
const Fit = Maximize2

const toolItems: { id: Tool; label: string; icon: typeof MousePointer2 }[] = [
  { id: 'select', label: 'Select / move', icon: MousePointer2 },
  { id: 'plot', label: 'Draw plot', icon: Shapes },
  { id: 'edit', label: 'Edit vertices', icon: Pencil },
  { id: 'road', label: 'Draw road', icon: Move },
  { id: 'amenity', label: 'Add amenity', icon: MapPin },
  { id: 'label', label: 'Add label', icon: FileImage },
  { id: 'measure', label: 'Measure image distance', icon: Ruler },
]
const layerNames: { id: LayerName; label: string }[] = [
  { id: 'base', label: 'Base layout' }, { id: 'roads', label: 'Roads' }, { id: 'plots', label: 'Plots' }, { id: 'amenities', label: 'Amenities' }, { id: 'labels', label: 'Labels' },
]
const amenityTypes = ['Main gate', 'Security', 'Park', 'Clubhouse', 'Temple', 'Swimming pool', "Children's play area", 'Commercial area', 'Water tank', 'Electricity', 'Drainage', 'Street lights']
const plotStatuses: PlotStatus[] = ['AVAILABLE', 'RESERVED', 'SOLD', 'HOLD', 'BLOCKED']
const clone = <T,>(value: T): T => structuredClone(value)
const uid = () => crypto.randomUUID()
const slugToId = (id: string) => id

function freshPlot(number: number, polygon: Point[]): Plot {
  return { id: uid(), plotNumber: `P-${String(number).padStart(3, '0')}`, block: '', area: 150, areaUnit: 'sq yd', width: 0, length: 0, facing: '', roadWidth: '', price: 0, pricePerUnit: 0, status: 'AVAILABLE', description: '', coordinates: polygon, labelPosition: polygonInteriorPoint(polygon), images: [] }
}

function initPlotState(data: unknown): LayoutDocument {
  if (data && typeof data === 'object' && Array.isArray((data as LayoutDocument).objects)) {
    const layout = data as LayoutDocument
    return { ...layout, objects: layout.objects ?? [], layers: { ...clone(defaultLayers), ...(layout.layers ?? {}) }, settings: layout.settings ?? {} }
  }
  return emptyLayout()
}

function EditorCanvas({ project, plots, layout, tool, selectedPlotId, selectedObjectId, drawing, measureStart, view, onCanvasClick, onPointerDown, onPointerMove, onPointerUp, onSelectPlot, onSelectObject, onDragStart = () => {}, onVertexDown, onDoubleClick, svgRef }: {
  project: Project; plots: Plot[]; layout: LayoutDocument; tool: Tool; selectedPlotId: string | null; selectedObjectId: string | null; drawing: Point[]; measureStart: Point | null; view: ViewBox
  onCanvasClick: (event: React.MouseEvent<SVGSVGElement>) => void; onPointerDown: (event: ReactPointerEvent<SVGSVGElement>) => void; onPointerMove: (event: ReactPointerEvent<SVGSVGElement>) => void; onPointerUp: () => void
  onSelectPlot: (id: string) => void; onSelectObject: (id: string) => void; onDragStart?: (event: ReactPointerEvent<SVGElement>, kind: DragKind, id: string, index?: number) => void; onVertexDown: (event: ReactPointerEvent<SVGCircleElement>, id: string, index: number) => void; onDoubleClick: () => void; svgRef: React.RefObject<SVGSVGElement | null>
}) {
  const layerVisible = (name: LayerName) => layout.layers[name]?.visible !== false
  return <svg ref={svgRef} className={`layout-svg tool-${tool}`} viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`} onClick={onCanvasClick} onDoubleClick={onDoubleClick} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onContextMenu={(event) => event.preventDefault()}>
    {layerVisible('base') && <image href={project.layoutUrl} x="0" y="0" width={project.layoutWidth} height={project.layoutHeight} preserveAspectRatio="xMidYMid meet" />}
    {layerVisible('roads') && <g className="road-layer">{layout.objects.filter((item): item is RoadObject => item.kind === 'road' && item.visible !== false).map((road) => <path key={road.id} data-editor-kind="object" data-editor-id={road.id} d={pathFromPoints(road.points, project.layoutWidth, project.layoutHeight)} fill="none" stroke={road.color} strokeWidth={road.width} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" opacity=".78" className={selectedObjectId === road.id ? 'vector-selected' : ''} onClick={(event) => { event.stopPropagation(); onSelectObject(road.id) }} onPointerDown={(event) => { onSelectObject(road.id); onDragStart(event, 'object', road.id) }} />)}</g>}
    {layerVisible('plots') && <g className="plot-layer">{plots.map((plot) => <g key={plot.id} className={`editor-plot${selectedPlotId === plot.id ? ' selected' : ''}`}>
      <polygon data-editor-kind="plot" data-editor-id={plot.id} points={plot.coordinates.map((point) => `${point.x * project.layoutWidth},${point.y * project.layoutHeight}`).join(' ')} fill={project.colors[plot.status] ?? defaultColors[plot.status]} fillOpacity={selectedPlotId === plot.id ? '.62' : '.43'} stroke={selectedPlotId === plot.id ? '#f3edda' : project.colors[plot.status] ?? defaultColors[plot.status]} strokeWidth={selectedPlotId === plot.id ? 2.5 : 1.5} vectorEffect="non-scaling-stroke" onClick={(event) => { event.stopPropagation(); onSelectPlot(plot.id) }} onPointerDown={(event) => { onSelectPlot(plot.id); onDragStart(event, 'plot', plot.id) }} />
      {layout.layers.plots.visible && <text className="editor-plot-label" x={(plot.labelPosition?.x ?? polygonInteriorPoint(plot.coordinates).x) * project.layoutWidth} y={(plot.labelPosition?.y ?? polygonInteriorPoint(plot.coordinates).y) * project.layoutHeight} textAnchor="middle" dominantBaseline="central" fontSize={Math.max(10, 12 + view.width * .001)} pointerEvents="none">{plot.plotNumber}</text>}
      {tool === 'edit' && selectedPlotId === plot.id && plot.coordinates.map((point, index) => <circle key={index} data-editor-kind="vertex" data-editor-id={plot.id} data-editor-index={index} className="vertex-handle" cx={point.x * project.layoutWidth} cy={point.y * project.layoutHeight} r={Math.max(5, view.width * .006)} onPointerDown={(event) => onVertexDown(event, plot.id, index)} />)}
    </g>)}</g>}
    {layerVisible('amenities') && layout.objects.filter((item): item is AmenityObject => item.kind === 'amenity' && item.visible !== false).map((amenity) => <g key={amenity.id} data-editor-kind="object" data-editor-id={amenity.id} className={`amenity-object${selectedObjectId === amenity.id ? ' active' : ''}`} transform={`translate(${amenity.x * project.layoutWidth} ${amenity.y * project.layoutHeight})`} onClick={(event) => { event.stopPropagation(); onSelectObject(amenity.id) }} onPointerDown={(event) => { onSelectObject(amenity.id); onDragStart(event, 'object', amenity.id) }}><circle r={Math.max(11, view.width * .013)} /><text y="1" textAnchor="middle" dominantBaseline="central">{amenity.amenityType.slice(0, 1)}</text><text className="amenity-caption" y={Math.max(25, view.width * .024)} textAnchor="middle">{amenity.name}</text></g>)}
    {layerVisible('labels') && layout.objects.filter((item): item is LabelObject => item.kind === 'label' && item.visible !== false).map((label) => <text key={label.id} data-editor-kind="object" data-editor-id={label.id} className={`custom-label${selectedObjectId === label.id ? ' active' : ''}`} x={label.x * project.layoutWidth} y={label.y * project.layoutHeight} fontSize={label.fontSize} textAnchor="middle" transform={`rotate(${label.rotation} ${label.x * project.layoutWidth} ${label.y * project.layoutHeight})`} onClick={(event) => { event.stopPropagation(); onSelectObject(label.id) }} onPointerDown={(event) => { onSelectObject(label.id); onDragStart(event, 'object', label.id) }}>{label.text}</text>)}
    {drawing.length > 0 && <g className="drawing-preview"><polyline points={drawing.map((point) => `${point.x * project.layoutWidth},${point.y * project.layoutHeight}`).join(' ')} fill={tool === 'plot' ? '#a8d77c20' : 'none'} stroke="#e4f6c4" strokeWidth="2" strokeDasharray="7 5" vectorEffect="non-scaling-stroke" />{drawing.map((point, index) => <circle key={index} cx={point.x * project.layoutWidth} cy={point.y * project.layoutHeight} r="4" />)}</g>}
    {measureStart && drawing.length > 0 && <g className="measure-preview"><line x1={measureStart.x * project.layoutWidth} y1={measureStart.y * project.layoutHeight} x2={drawing[0].x * project.layoutWidth} y2={drawing[0].y * project.layoutHeight} /><text x={(measureStart.x + drawing[0].x) / 2 * project.layoutWidth} y={(measureStart.y + drawing[0].y) / 2 * project.layoutHeight}>MEASURED IN IMAGE PIXELS</text></g>}
  </svg>
}

function PropertyField({ label, value, onChange, type = 'text', suffix }: { label: string; value: string | number; onChange: (value: string) => void; type?: string; suffix?: string }) {
  return <label className="property-field"><span>{label}</span><div className={suffix ? 'property-input-suffix' : ''}><input type={type} value={value} onChange={(event) => onChange(event.target.value)} />{suffix && <i>{suffix}</i>}</div></label>
}

export default function Editor({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<Project | null>(null)
  const [plots, setPlots] = useState<Plot[]>([])
  const [layout, setLayout] = useState<LayoutDocument>(emptyLayout)
  const [loaded, setLoaded] = useState(false)
  const [tool, setTool] = useState<Tool>('select')
  const [selectedPlotId, setSelectedPlotId] = useState<string | null>(null)
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null)
  const [drawing, setDrawing] = useState<Point[]>([])
  const [measureStart, setMeasureStart] = useState<Point | null>(null)
  const [view, setView] = useState<ViewBox>({ x: 0, y: 0, width: 1000, height: 700 })
  const [history, setHistory] = useState<Snapshot[]>([])
  const [future, setFuture] = useState<Snapshot[]>([])
  const [saveState, setSaveState] = useState<'loading' | 'saving' | 'saved' | 'error'>('loading')
  const [notice, setNotice] = useState('')
  const [embedOpen, setEmbedOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<Drag | null>(null)

  const record = useCallback((before: Snapshot) => {
    setHistory((items) => [...items, clone(before)].slice(-80))
    setFuture([])
  }, [])
  const snapshot = useCallback((): Snapshot => ({ plots: clone(plots), layout: clone(layout) }), [plots, layout])
  const commit = useCallback((nextPlots: Plot[], nextLayout: LayoutDocument) => {
    record(snapshot()); setPlots(nextPlots); setLayout(nextLayout)
  }, [record, snapshot])

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const result = await api<Project>(`/projects/id/${encodeURIComponent(projectId)}`)
        const [plotList] = await Promise.all([api<Plot[]>(`/projects/${encodeURIComponent(result.slug)}/plots`), Promise.resolve(null)])
        if (!active) return
        setProject(result); setPlots(plotList); setLayout(initPlotState(result.layout)); setView({ x: 0, y: 0, width: result.layoutWidth, height: result.layoutHeight }); setLoaded(true); setSaveState('saved')
      } catch (error) { setNotice((error as Error).message); setSaveState('error') }
    }
    void load()
    return () => { active = false }
  }, [projectId])

  useEffect(() => {
    if (!loaded || !project) return
    setSaveState('saving')
    const timeout = window.setTimeout(async () => {
      try {
        await Promise.all([savePlots(project.slug, plots), saveLayout(project.slug, layout), api(`/projects/${encodeURIComponent(project.slug)}`, jsonRequest('PUT', { name: project.name, slug: project.slug, location: project.location, description: project.description, contactNumber: project.contactNumber, whatsappNumber: project.whatsappNumber, colors: project.colors, status: project.status }))])
        setSaveState('saved')
      } catch (error) { setNotice((error as Error).message); setSaveState('error') }
    }, 750)
    return () => window.clearTimeout(timeout)
  }, [loaded, project, plots, layout])

  const selectedPlot = plots.find((plot) => plot.id === selectedPlotId) ?? null
  const selectedObject = layout.objects.find((item) => item.id === selectedObjectId) ?? null
  const pointAt = (event: { clientX: number; clientY: number }) => {
    if (!svgRef.current) return { x: 0, y: 0 }
    const matrix = svgRef.current.getScreenCTM()
    if (!matrix) return { x: 0, y: 0 }
    const mapped = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
    return { x: mapped.x, y: mapped.y }
  }
  const addObject = (object: LayoutObject) => commit(plots, { ...layout, objects: [...layout.objects, object] })
  const addPlot = (points: Point[]) => {
    if (points.length < 3 || !project) return
    const plot = freshPlot(Math.max(0, ...plots.map((item) => Number(item.plotNumber.replace(/\D/g, '')) || 0)) + 1, points)
    commit([...plots, plot], layout); setSelectedPlotId(plot.id); setSelectedObjectId(null); setDrawing([]); setNotice(`${plot.plotNumber} created`)
  }
  const finishDrawing = () => {
    if (!project) return
    if (tool === 'plot') addPlot(drawing)
    if (tool === 'road' && drawing.length >= 2) {
      const road: RoadObject = { id: uid(), kind: 'road', name: 'Internal road', roadType: 'Internal', width: 8, color: '#e8d9af', points: drawing, visible: true, locked: false }
      addObject(road); setSelectedObjectId(road.id); setDrawing([])
    }
  }
  const onCanvasClick = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!project || event.target !== event.currentTarget && (event.target as Element).tagName !== 'image') return
    const point = clampPoint(pointAt(event), project.layoutWidth, project.layoutHeight)
    if (tool === 'plot' || tool === 'road') {
      if (tool === 'plot' && drawing.length > 2 && Math.hypot(point.x - drawing[0].x, point.y - drawing[0].y) < .018) return finishDrawing()
      setDrawing((items) => [...items, point]); return
    }
    if (tool === 'amenity') {
      const amenity: AmenityObject = { id: uid(), kind: 'amenity', name: 'Park', amenityType: 'Park', ...point, visible: true, locked: false }
      addObject(amenity); setSelectedObjectId(amenity.id); setSelectedPlotId(null); setTool('select')
    } else if (tool === 'label') {
      const label: LabelObject = { id: uid(), kind: 'label', name: 'Custom label', text: 'SITE LABEL', ...point, fontSize: 22, rotation: 0, visible: true, locked: false }
      addObject(label); setSelectedObjectId(label.id); setSelectedPlotId(null); setTool('select')
    } else if (tool === 'measure') {
      if (!measureStart) { setMeasureStart(point); setDrawing([]) }
      else { setDrawing([point]); setNotice(`${Math.round(Math.hypot((point.x - measureStart.x) * project.layoutWidth, (point.y - measureStart.y) * project.layoutHeight))} image px`); setMeasureStart(null); setDrawing([]) }
    } else if (tool === 'select') { setSelectedPlotId(null); setSelectedObjectId(null) }
  }

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!project) return
    const target = (event.target as Element).closest<SVGElement>('[data-editor-kind]')
    if (target) {
      const id = target.dataset.editorId
      const kind = target.dataset.editorKind
      if (id && kind === 'plot') { setSelectedPlotId(id); setSelectedObjectId(null); if (tool === 'select') onItemPointerDown(event, 'plot', id); return }
      if (id && kind === 'object') { setSelectedObjectId(id); setSelectedPlotId(null); if (tool === 'select') onItemPointerDown(event, 'object', id); return }
      if (id && kind === 'vertex') { setSelectedPlotId(id); setSelectedObjectId(null); const index = Number(target.dataset.editorIndex); if (tool === 'edit' && Number.isInteger(index)) onItemPointerDown(event, 'vertex', id, index); return }
    }
    if (event.target !== event.currentTarget || tool !== 'select') return
    dragRef.current = { kind: 'pan', clientX: event.clientX, clientY: event.clientY, view: { ...view } }
    svgRef.current?.setPointerCapture(event.pointerId)
  }
  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current
    if (!drag || !project) return
    if (drag.kind === 'pan') {
      const rect = svgRef.current?.getBoundingClientRect()
      if (!rect) return
      setView({ ...drag.view, x: drag.view.x - (event.clientX - drag.clientX) * drag.view.width / rect.width, y: drag.view.y - (event.clientY - drag.clientY) * drag.view.height / rect.height })
      return
    }
    const current = clampPoint(pointAt(event), project.layoutWidth, project.layoutHeight)
    const dx = current.x - drag.start.x; const dy = current.y - drag.start.y
    if (drag.kind === 'plot' || drag.kind === 'vertex') {
      setPlots(drag.before.plots.map((plot) => plot.id !== drag.id ? plot : { ...plot, coordinates: plot.coordinates.map((point, index) => drag.kind === 'vertex' && index === drag.index ? current : drag.kind === 'plot' ? { x: Math.max(0, Math.min(1, point.x + dx)), y: Math.max(0, Math.min(1, point.y + dy)) } : point), labelPosition: plot.labelPosition && drag.kind === 'plot' ? { x: Math.max(0, Math.min(1, plot.labelPosition.x + dx)), y: Math.max(0, Math.min(1, plot.labelPosition.y + dy)) } : plot.labelPosition }))
    } else if (drag.kind === 'object') {
      setLayout({ ...drag.before.layout, objects: drag.before.layout.objects.map((item) => {
        if (item.id !== drag.id) return item
        if (item.kind === 'road') return { ...item, points: item.points.map((point) => ({ x: Math.max(0, Math.min(1, point.x + dx)), y: Math.max(0, Math.min(1, point.y + dy)) })) }
        return { ...item, x: Math.max(0, Math.min(1, item.x + dx)), y: Math.max(0, Math.min(1, item.y + dy)) }
      }) })
    }
  }
  const onPointerUp = () => {
    const drag = dragRef.current
    if (drag && drag.kind !== 'pan') record(drag.before)
    dragRef.current = null
  }
  const onItemPointerDown = (event: ReactPointerEvent<SVGElement>, kind: DragKind, id: string, index?: number) => {
    if (tool === 'edit' && kind === 'vertex') {
      event.stopPropagation(); event.preventDefault()
    } else if (tool !== 'select') return
    else event.stopPropagation()
    const object = layout.objects.find((item) => item.id === id)
    const layerName: LayerName = kind === 'plot' || kind === 'vertex' ? 'plots' : object?.kind === 'road' ? 'roads' : object?.kind === 'amenity' ? 'amenities' : 'labels'
    if (layout.layers[layerName].locked) return
    const start = clampPoint(pointAt(event), project!.layoutWidth, project!.layoutHeight)
    dragRef.current = { kind, id, index, start, before: snapshot() }
    svgRef.current?.setPointerCapture(event.pointerId)
  }
  const undo = () => {
    setHistory((items) => {
      if (!items.length) return items
      const previous = items[items.length - 1]
      setFuture((next) => [snapshot(), ...next].slice(0, 80)); setPlots(previous.plots); setLayout(previous.layout)
      return items.slice(0, -1)
    })
  }
  const redo = () => {
    setFuture((items) => {
      if (!items.length) return items
      const next = items[0]
      setHistory((current) => [...current, snapshot()].slice(-80)); setPlots(next.plots); setLayout(next.layout)
      return items.slice(1)
    })
  }
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo() }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo() }
      if (event.key === 'Escape') { setDrawing([]); setMeasureStart(null); setTool('select') }
      if (event.key === 'Enter' && drawing.length > 0) finishDrawing()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const zoomBy = (factor: number) => setView((current) => { const width = Math.max(project!.layoutWidth * .08, Math.min(project!.layoutWidth * 2, current.width / factor)); const height = width * current.height / current.width; return { x: current.x + (current.width - width) / 2, y: current.y + (current.height - height) / 2, width, height } })
  const fit = () => project && setView({ x: 0, y: 0, width: project.layoutWidth, height: project.layoutHeight })
  const updatePlot = (id: string, patch: Partial<Plot>) => { const next = plots.map((plot) => plot.id === id ? { ...plot, ...patch } : plot); commit(next, layout) }
  const updateObject = (id: string, patch: Partial<LayoutObject>) => { const next = layout.objects.map((item) => item.id === id ? { ...item, ...patch } as LayoutObject : item); commit(plots, { ...layout, objects: next }) }
  const deleteSelection = () => {
    if (selectedPlotId) { commit(plots.filter((plot) => plot.id !== selectedPlotId), layout); setSelectedPlotId(null) }
    else if (selectedObjectId) { commit(plots, { ...layout, objects: layout.objects.filter((item) => item.id !== selectedObjectId) }); setSelectedObjectId(null) }
  }
  const toggleLayer = (name: LayerName, field: 'visible' | 'locked') => commit(plots, { ...layout, layers: { ...layout.layers, [name]: { ...layout.layers[name], [field]: !layout.layers[name][field] } } })
  const addVertex = () => {
    if (!selectedPlot) return
    const points = selectedPlot.coordinates
    const lengths = points.map((point, index) => Math.hypot(point.x - points[(index + 1) % points.length].x, point.y - points[(index + 1) % points.length].y))
    const edge = lengths.indexOf(Math.max(...lengths)); const next = points[(edge + 1) % points.length]
    const updated = [...points.slice(0, edge + 1), { x: (points[edge].x + next.x) / 2, y: (points[edge].y + next.y) / 2 }, ...points.slice(edge + 1)]
    updatePlot(selectedPlot.id, { coordinates: updated })
  }
  const removeVertex = () => { if (selectedPlot && selectedPlot.coordinates.length > 3) updatePlot(selectedPlot.id, { coordinates: selectedPlot.coordinates.slice(0, -1) }) }
  const updateProject = (patch: Partial<Project>) => setProject((current) => current ? { ...current, ...patch } : current)
  const publish = async () => {
    if (!project) return
    try { const updated = await api<Project>(`/projects/${encodeURIComponent(project.slug)}/publish`, { method: 'POST' }); setProject(updated); setNotice('Published customer viewer is live.') }
    catch (error) { setNotice((error as Error).message) }
  }
  const unpublish = async () => {
    if (!project) return
    try { await api(`/projects/${encodeURIComponent(project.slug)}/unpublish`, { method: 'POST' }); setProject({ ...project, status: 'DRAFT' }); setNotice('Project returned to draft.') }
    catch (error) { setNotice((error as Error).message) }
  }
  const uploadReplacement = async (file?: File) => {
    if (!project || !file) return
    try {
      const url = URL.createObjectURL(file); const image = new Image(); image.src = url; await image.decode(); URL.revokeObjectURL(url)
      const form = new FormData(); form.set('layoutWidth', String(image.naturalWidth)); form.set('layoutHeight', String(image.naturalHeight)); form.set('layout', file)
      const updated = await api<Project>(`/projects/${encodeURIComponent(project.slug)}/layout-image`, { method: 'PUT', body: form })
      updateProject(updated); setView({ x: 0, y: 0, width: updated.layoutWidth, height: updated.layoutHeight }); setNotice('Base layout replaced. Normalized vectors remain aligned.')
    } catch (error) { setNotice((error as Error).message) }
  }
  const selectedTool = toolItems.find((item) => item.id === tool)
  const zoomPercent = project ? Math.round(project.layoutWidth / view.width * 100) : 100
  const embedCode = project ? `<iframe src="${window.location.origin}/embed/${project.slug}" title="${project.name} interactive layout" width="100%" height="700" style="border:0" loading="lazy"></iframe>` : ''
  const layerStats = useMemo(() => ({ plots: plots.length, roads: layout.objects.filter((item) => item.kind === 'road').length, amenities: layout.objects.filter((item) => item.kind === 'amenity').length, labels: layout.objects.filter((item) => item.kind === 'label').length }), [plots, layout.objects])
  const layoutStats = layerStats

  if (!project || !loaded) return <div className="studio-loading"><span className="loading-mark" />{notice || 'Opening layout editor'}</div>

  return <main className="layout-editor-shell">
    <header className="editor-topbar"><a href="/admin" className="editor-back"><ArrowLeft size={16} /><span>Projects</span></a><span className="editor-top-divider" /><div className="editor-project-title"><strong>{project.name}</strong><span>{project.location || project.slug}</span></div><span className={`project-status-tag ${project.status.toLowerCase()}`}><i />{project.status}</span><div className="editor-header-spacer" /><span className={`save-indicator ${saveState}`}><i />{saveState === 'saving' ? 'Saving changes' : saveState === 'error' ? 'Save error' : 'All changes saved'}</span><button className="studio-button subtle" onClick={() => window.open(`/project/${project.slug}?preview=1`, '_blank', 'noopener,noreferrer')}>Preview</button><button className="studio-button subtle" onClick={() => setEmbedOpen(true)}>Embed</button>{project.status === 'PUBLISHED' ? <button className="studio-button publish-button" onClick={() => void unpublish()}>Unpublish</button> : <button className="studio-button publish-button" onClick={() => void publish()}>Publish <ArrowRight size={15} /></button>}</header>
    <nav className="editor-toolbar" aria-label="Editor tools"><div className="tool-group">{toolItems.map(({ id, label, icon: Icon }) => <button key={id} className={`tool-button${tool === id ? ' active' : ''}`} title={label} aria-label={label} onClick={() => { setTool(id); setDrawing([]); setMeasureStart(null) }}><Icon size={16} /><span>{id === 'select' ? 'Select' : id === 'edit' ? 'Edit' : id === 'plot' ? 'Plot' : id === 'road' ? 'Road' : id === 'amenity' ? 'Amenity' : id === 'label' ? 'Label' : 'Measure'}</span></button>)}</div><span className="toolbar-divider" /><div className="tool-group history-tools"><button disabled={!history.length} className="tool-button icon-only" title="Undo (Ctrl+Z)" onClick={undo}><Undo2 size={16} /></button><button disabled={!future.length} className="tool-button icon-only" title="Redo (Ctrl+Shift+Z)" onClick={redo}><Redo2 size={16} /></button></div>{drawing.length > 0 && <button className="finish-drawing" onClick={finishDrawing}><Check size={14} />Finish {tool === 'plot' ? 'plot' : 'road'}</button>}<span className="toolbar-hint">{tool === 'plot' ? 'Click boundary points · Enter to close' : tool === 'road' ? 'Click to trace road · Enter to finish' : tool === 'edit' ? 'Drag polygon vertices to reshape' : tool === 'amenity' || tool === 'label' ? 'Click the plan to place' : tool === 'measure' ? 'Click two points · image pixels only' : 'Drag to pan · select and move objects'}</span></nav>
    <div className="editor-workspace">
      <aside className="editor-left-panel"><div className="editor-panel-title"><span>LAYERS</span><span>{Object.values(layerStats).reduce((sum, value) => sum + value, 0)} OBJECTS</span></div>{layerNames.map(({ id, label }) => <div className={`layer-row ${layout.layers[id].visible ? '' : 'hidden'}`} key={id}><span className={`layer-glyph ${id}`} /> <span className="layer-name">{label}<small>{id === 'base' ? 'Original image' : `${layerStats[id] ?? 0} objects`}</small></span><button className="layer-icon" title={layout.layers[id].visible ? 'Hide layer' : 'Show layer'} onClick={() => toggleLayer(id, 'visible')}>{layout.layers[id].visible ? <Eye size={14} /> : <EyeOff size={14} />}</button><button className="layer-icon" title={layout.layers[id].locked ? 'Unlock layer' : 'Lock layer'} onClick={() => toggleLayer(id, 'locked')}>{layout.layers[id].locked ? <LockKeyhole size={13} /> : <Lock size={13} />}</button></div>)}<div className="editor-left-rule" /><label className="replace-layout"><Upload size={14} /><span>Replace base image</span><input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg" onChange={(event) => void uploadReplacement(event.target.files?.[0])} /></label><div className="layer-help">Base art stays separate.<br />Vectors scale with the drawing.</div></aside>
      <section className="editor-canvas-stage"><div className="canvas-heading"><div><span className="eyebrow">{project.slug.toUpperCase()}</span><strong>{project.layoutWidth} × {project.layoutHeight} <small>BASE IMAGE</small></strong></div><div className="canvas-controls"><button title="Zoom out" onClick={() => zoomBy(.8)}><ZoomOut size={16} /></button><span>{zoomPercent}%</span><button title="Zoom in" onClick={() => zoomBy(1.25)}><ZoomIn size={16} /></button><button title="Fit layout" onClick={fit}><Fit size={15} /></button></div></div><div className="canvas-view" onWheel={(event) => { if (event.ctrlKey || event.metaKey) { event.preventDefault(); zoomBy(event.deltaY < 0 ? 1.1 : .9) } }}><div className="canvas-surface"><EditorCanvas project={project} plots={plots} layout={layout} tool={tool} selectedPlotId={selectedPlotId} selectedObjectId={selectedObjectId} drawing={drawing} measureStart={measureStart} view={view} svgRef={svgRef} onCanvasClick={onCanvasClick} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onSelectPlot={(id) => { setSelectedPlotId(id); setSelectedObjectId(null) }} onSelectObject={(id) => { setSelectedObjectId(id); setSelectedPlotId(null) }} onVertexDown={(event, id, index) => onItemPointerDown(event as unknown as ReactPointerEvent<SVGSVGElement>, 'vertex', id, index)} onDoubleClick={() => { if (drawing.length > 0) finishDrawing() }} /></div><div className="canvas-north"><Compass size={17} /><span>N</span></div><div className="canvas-scale">VIEWPORT PREVIEW · ORIGINAL RATIO</div>{selectedTool && <div className="tool-status"><selectedTool.icon size={14} />{selectedTool.label}</div>}</div><footer className="canvas-status"><span>{plots.length} PLOTS</span><i /><span>{layoutStats.roads} ROADS</span><i /><span>{layoutStats.amenities} AMENITIES</span><i /><span>{layoutStats.labels} LABELS</span><span className="canvas-status-spacer" /><span>{Math.round(view.width)} × {Math.round(view.height)} VIEW</span></footer></section>
      <aside className="editor-properties"><div className="property-panel-head"><div><span className="eyebrow">INSPECTOR</span><h2>{selectedPlot ? selectedPlot.plotNumber : selectedObject?.name ?? 'Project settings'}</h2></div>{(selectedPlot || selectedObject) && <button className="property-delete" title="Delete selected object" onClick={deleteSelection}><Trash2 size={15} /></button>}</div>
        {selectedPlot ? <div className="property-scroll"><span className="property-section-label">PLOT DETAILS</span><div className="property-two"><PropertyField label="Plot number" value={selectedPlot.plotNumber} onChange={(value) => updatePlot(selectedPlot.id, { plotNumber: value })} /><PropertyField label="Block" value={selectedPlot.block} onChange={(value) => updatePlot(selectedPlot.id, { block: value })} /></div><div className="property-two"><PropertyField label="Area" type="number" value={selectedPlot.area} suffix={selectedPlot.areaUnit} onChange={(value) => updatePlot(selectedPlot.id, { area: Number(value) })} /><PropertyField label="Area unit" value={selectedPlot.areaUnit} onChange={(value) => updatePlot(selectedPlot.id, { areaUnit: value })} /></div><div className="property-two"><PropertyField label="Width" type="number" value={selectedPlot.width} onChange={(value) => updatePlot(selectedPlot.id, { width: Number(value) })} /><PropertyField label="Length" type="number" value={selectedPlot.length} onChange={(value) => updatePlot(selectedPlot.id, { length: Number(value) })} /></div><label className="property-field"><span>Facing</span><select value={selectedPlot.facing} onChange={(event) => updatePlot(selectedPlot.id, { facing: event.target.value })}><option value="">Select facing</option>{['North', 'South', 'East', 'West', 'North-east', 'North-west', 'South-east', 'South-west'].map((facing) => <option key={facing}>{facing}</option>)}</select></label><PropertyField label="Road width" value={selectedPlot.roadWidth} onChange={(value) => updatePlot(selectedPlot.id, { roadWidth: value })} /><PropertyField label="Price" type="number" value={selectedPlot.price} onChange={(value) => updatePlot(selectedPlot.id, { price: Number(value) })} /><label className="property-field"><span>Status</span><select value={selectedPlot.status} onChange={(event) => updatePlot(selectedPlot.id, { status: event.target.value as PlotStatus })}>{plotStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></label><label className="property-field"><span>Description</span><textarea rows={3} value={selectedPlot.description} onChange={(event) => updatePlot(selectedPlot.id, { description: event.target.value })} /></label><div className="vertex-actions"><button onClick={addVertex}><Plus size={13} />Add point</button><button onClick={removeVertex}><Trash2 size={13} />Remove last</button></div></div> : selectedObject ? <ObjectProperties item={selectedObject} onChange={(patch) => updateObject(selectedObject.id, patch)} /> : <div className="property-scroll project-settings"><span className="property-section-label">PROJECT SETTINGS</span><p>Plot status colors are stored per project and used by the customer viewer.</p>{plotStatuses.map((status) => <label className="color-property" key={status}><span><i style={{ background: project.colors[status] ?? defaultColors[status] }} />{statusLabels[status]}</span><input type="color" value={project.colors[status] ?? defaultColors[status]} onChange={(event) => updateProject({ colors: { ...project.colors, [status]: event.target.value } })} /></label>)}<div className="property-divider" /><PropertyField label="Project name" value={project.name} onChange={(value) => updateProject({ name: value })} /><PropertyField label="Location" value={project.location} onChange={(value) => updateProject({ location: value })} /><label className="property-field"><span>Description</span><textarea value={project.description} rows={3} onChange={(event) => updateProject({ description: event.target.value })} /></label><PropertyField label="Contact number" value={project.contactNumber} onChange={(value) => updateProject({ contactNumber: value })} /><PropertyField label="WhatsApp number" value={project.whatsappNumber} onChange={(value) => updateProject({ whatsappNumber: value })} /></div>}
        <div className="property-panel-foot"><span>{selectedPlot || selectedObject ? 'SELECTED OBJECT' : 'PROJECT'} · AUTOSAVE ON</span><button onClick={() => void api('/auth/status').then(() => setNotice('Session active'))}><Save size={13} />Save status</button></div>
      </aside>
    </div>
    {notice && <button className="editor-toast" onClick={() => setNotice('')}>{notice}<span>×</span></button>}
    {embedOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEmbedOpen(false) }}><section className="embed-modal" role="dialog" aria-modal="true"><div className="modal-heading"><div><span className="eyebrow">CUSTOMER VIEWER</span><h2>Embed this project.</h2></div><button className="icon-button" onClick={() => setEmbedOpen(false)}>×</button></div><p className="modal-description">This responsive viewer works independently of the host site. Publish the project before sharing the embed URL.</p><a className="viewer-route-link" href={`/embed/${slugToId(project.slug)}`} target="_blank" rel="noreferrer">Open embed preview <ArrowRight size={14} /></a><pre className="embed-code"><code>{embedCode}</code></pre><div className="modal-actions"><span>{project.status === 'PUBLISHED' ? 'PUBLIC VIEW ENABLED' : 'PREVIEW ONLY UNTIL PUBLISHED'}</span><button className="studio-button primary" onClick={() => { void navigator.clipboard.writeText(embedCode).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1700) }) }}>{copied ? 'Copied' : 'Copy iframe code'}</button></div></section></div>}
  </main>
}

function ObjectProperties({ item, onChange }: { item: LayoutObject; onChange: (patch: Partial<LayoutObject>) => void }) {
  if (item.kind === 'road') return <div className="property-scroll"><span className="property-section-label">ROAD PROPERTIES</span><PropertyField label="Road name" value={item.name} onChange={(name) => onChange({ name })} /><PropertyField label="Road type" value={item.roadType} onChange={(roadType) => onChange({ roadType })} /><PropertyField label="Width" type="number" value={item.width} suffix="m" onChange={(value) => onChange({ width: Number(value) })} /><label className="property-field"><span>Color</span><input type="color" value={item.color} onChange={(event) => onChange({ color: event.target.value })} /></label><p className="property-note">Polyline with {item.points.length} editable trace points.</p></div>
  if (item.kind === 'amenity') return <div className="property-scroll"><span className="property-section-label">AMENITY PROPERTIES</span><label className="property-field"><span>Amenity</span><select value={item.amenityType} onChange={(event) => onChange({ amenityType: event.target.value, name: event.target.value })}>{amenityTypes.map((type) => <option key={type}>{type}</option>)}</select></label><PropertyField label="Display label" value={item.name} onChange={(name) => onChange({ name })} /><p className="property-note">Drag the marker to reposition it on the base layout.</p></div>
  return <div className="property-scroll"><span className="property-section-label">LABEL PROPERTIES</span><PropertyField label="Text" value={item.text} onChange={(text) => onChange({ text, name: text })} /><PropertyField label="Font size" type="number" value={item.fontSize} onChange={(value) => onChange({ fontSize: Number(value) })} /><PropertyField label="Rotation" type="number" value={item.rotation} onChange={(value) => onChange({ rotation: Number(value) })} /><p className="property-note">Drag the label to reposition it. Text remains independent from the uploaded art.</p></div>
}
