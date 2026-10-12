import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { ArrowUpRight, ChevronDown, Compass, Eye, EyeOff, Images, LayoutGrid, LocateFixed, MapPin, MessageCircle, Phone, Search, SlidersHorizontal, X, ZoomIn, ZoomOut } from 'lucide-react'
import { api } from './api'
import { eventPoint, polygonInteriorPoint } from './geometry'
import { defaultColors, statusLabels, type Plot, type PlotStatus, type Point, type Project } from './types'

type ViewBox = { x: number; y: number; width: number; height: number }
const statuses: PlotStatus[] = ['AVAILABLE', 'RESERVED', 'SOLD', 'HOLD', 'BLOCKED']
const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

export default function Viewer({ slug, embed = false }: { slug: string; embed?: boolean }) {
  const preview = new URLSearchParams(window.location.search).get('preview') === '1'
  const [project, setProject] = useState<Project | null>(null)
  const [plots, setPlots] = useState<Plot[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<PlotStatus | 'ALL'>('ALL')
  const [facing, setFacing] = useState('ALL')
  const [minArea, setMinArea] = useState('')
  const [maxArea, setMaxArea] = useState('')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [plotsVisible, setPlotsVisible] = useState(true)
  const [amenitiesVisible, setAmenitiesVisible] = useState(true)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [view, setView] = useState<ViewBox>({ x: 0, y: 0, width: 1000, height: 700 })
  const [hoverInfo, setHoverInfo] = useState<{ x: number; y: number; mapX: number; mapY: number; plotId: string | null; locationName: string; locationKind: string } | null>(null)
  const [error, setError] = useState('')
  const svgRef = useRef<SVGSVGElement>(null)
  const mapRef = useRef<HTMLDivElement>(null)
  const panRef = useRef<{ x: number; y: number; view: ViewBox } | null>(null)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const result = await api<Project>(`/projects/${encodeURIComponent(slug)}${preview ? '?preview=1' : ''}`)
        const items = await api<Plot[]>(`/projects/${encodeURIComponent(slug)}/plots${preview ? '?preview=1' : ''}`)
        if (!active) return
        setProject(result); setPlots(items); setView({ x: 0, y: 0, width: result.layoutWidth, height: result.layoutHeight })
      } catch (reason) { if (active) setError((reason as Error).message) }
    }
    void load()
    return () => { active = false }
  }, [slug, preview])

  const visible = useMemo(() => plots.filter((plot) =>
    (status === 'ALL' || plot.status === status)
    && (facing === 'ALL' || plot.facing.toLowerCase() === facing.toLowerCase())
    && (!search || `${plot.plotNumber} ${plot.block}`.toLowerCase().includes(search.toLowerCase()))
    && (!minArea || plot.area >= Number(minArea)) && (!maxArea || plot.area <= Number(maxArea))
    && (!minPrice || plot.price >= Number(minPrice)) && (!maxPrice || plot.price <= Number(maxPrice)),
  ), [plots, status, facing, search, minArea, maxArea, minPrice, maxPrice])
  const selected = plots.find((plot) => plot.id === selectedId) ?? null
  const galleryImages = plots.flatMap((plot) => plot.images.map((image) => ({ image, plot })))
  const counts = useMemo(() => Object.fromEntries(statuses.map((item) => [item, plots.filter((plot) => plot.status === item).length])) as Record<PlotStatus, number>, [plots])

  function zoom(factor: number, focus?: Point) {
    if (!project) return
    setView((current) => {
      const width = Math.max(project.layoutWidth * .045, Math.min(project.layoutWidth * 2, current.width / factor))
      const height = width * current.height / current.width
      const point = focus ?? { x: current.x + current.width / 2, y: current.y + current.height / 2 }
      const ratio = width / current.width
      return { x: point.x - (point.x - current.x) * ratio, y: point.y - (point.y - current.y) * ratio, width, height }
    })
  }
  function fit() { if (project) setView({ x: 0, y: 0, width: project.layoutWidth, height: project.layoutHeight }) }
  function plotBounds(plot: Plot): ViewBox {
    const xs = plot.coordinates.map((point) => point.x * project!.layoutWidth)
    const ys = plot.coordinates.map((point) => point.y * project!.layoutHeight)
    const width = Math.max(...xs) - Math.min(...xs)
    const height = Math.max(...ys) - Math.min(...ys)
    const margin = Math.max(width, height) * 2.7
    return { x: Math.max(0, Math.min(project!.layoutWidth - width - margin * 2, Math.min(...xs) - margin)), y: Math.max(0, Math.min(project!.layoutHeight - height - margin * 2, Math.min(...ys) - margin)), width: Math.min(project!.layoutWidth, width + margin * 2), height: Math.min(project!.layoutHeight, height + margin * 2) }
  }
  function selectPlot(plot: Plot) { setSelectedId(plot.id); setView(plotBounds(plot)) }
  function submitSearch() {
    const exact = visible.find((plot) => plot.plotNumber.toLowerCase() === search.trim().toLowerCase())
    const match = exact ?? visible.find((plot) => plot.plotNumber.toLowerCase().includes(search.trim().toLowerCase()))
    if (match) selectPlot(match)
  }
  function panStart(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.target !== event.currentTarget && (event.target as Element).tagName !== 'image') return
    setHoverInfo(null)
    panRef.current = { x: event.clientX, y: event.clientY, view: { ...view } }
    svgRef.current?.setPointerCapture(event.pointerId)
  }
  function updateHover(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.pointerType === 'touch' || !svgRef.current || !mapRef.current) return
    const point = eventPoint(event, svgRef.current)
    const bounds = mapRef.current.getBoundingClientRect()
    const hoveredElement = event.target instanceof Element ? event.target : null
    const plotId = hoveredElement?.closest<SVGGElement>('[data-plot-id]')?.dataset.plotId ?? null
    const location = hoveredElement?.closest<SVGElement>('[data-map-location]')
    const locationName = location?.dataset.mapLocation ?? ''
    const locationKind = location?.dataset.mapKind ?? ''
    setHoverInfo({
      x: Math.max(8, Math.min(event.clientX - bounds.left + 14, bounds.width - 268)),
      y: Math.max(8, Math.min(event.clientY - bounds.top + 14, bounds.height - 156)),
      mapX: point.x,
      mapY: point.y,
      plotId,
      locationName,
      locationKind,
    })
  }
  function panMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (panRef.current) {
      setHoverInfo(null)
    } else {
      updateHover(event)
    }
    if (!panRef.current || !svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    setView({ ...panRef.current.view, x: panRef.current.view.x - (event.clientX - panRef.current.x) * panRef.current.view.width / rect.width, y: panRef.current.view.y - (event.clientY - panRef.current.y) * panRef.current.view.height / rect.height })
  }

  if (error) return <main className="viewer-error"><span className="eyebrow">PROJECT UNAVAILABLE</span><h1>This layout isn't published.</h1><p>Check the project link or ask the project team for an updated URL.</p><a href="/admin">Project studio <ArrowUpRight size={14} /></a></main>
  if (!project) return <div className="studio-loading"><span className="loading-mark" />Opening site plan</div>
  const hasObjects = project.layout?.objects ?? []
  const enquiryUrl = project.whatsappNumber
    ? `https://wa.me/${project.whatsappNumber.replace(/\D/g, '')}?text=${encodeURIComponent(selected ? `I'm interested in ${selected.plotNumber} at ${project.name}.` : `I'm interested in ${project.name}.`)}`
    : project.contactNumber ? `tel:${project.contactNumber}` : null

  return <main className={`customer-viewer${embed ? ' embed-viewer' : ''}`}>
    {!embed && <header className="viewer-topbar">
      <a href={`/project/${project.slug}`} className="viewer-project-brand"><span className="viewer-brand-mark">{project.name.slice(0, 1).toUpperCase()}</span><span><strong>{project.name}</strong><small>{project.location}</small></span></a>
      <div className="viewer-header-search"><Search size={17} /><input aria-label="Search plot number" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submitSearch() }} placeholder="Search plot number" /><button onClick={submitSearch}>GO</button></div>
      <div className="viewer-header-actions">
        {project.contactNumber && <a className="viewer-header-icon" href={`tel:${project.contactNumber}`} aria-label="Call project team"><Phone size={16} /></a>}
        <a className="viewer-header-icon" href="/admin" aria-label="Open project studio"><LayoutGrid size={16} /></a>
        {enquiryUrl && <a className="viewer-contact-top" href={enquiryUrl} target={project.whatsappNumber ? '_blank' : undefined} rel="noreferrer">{project.whatsappNumber ? <><MessageCircle size={15} /> WhatsApp</> : <><Phone size={15} /> Call</>}</a>}
      </div>
    </header>}
    <div className="viewer-layout">
      {!embed && <aside className="viewer-sidebar"><div className="viewer-sidebar-heading"><span className="eyebrow">EXPLORE THE SITE</span><h1>Find your place.</h1><p>{project.location}</p></div>
        <div className="viewer-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submitSearch() }} placeholder="Search plot or block" /><button onClick={submitSearch} aria-label="Search plots"><ArrowUpRight size={15} /></button></div>
        <button className={`filter-toggle${filtersOpen ? ' active' : ''}`} onClick={() => setFiltersOpen(!filtersOpen)}><SlidersHorizontal size={15} /> Filter plots <ChevronDown size={15} /></button>
        {filtersOpen && <div className="viewer-filter-panel"><label>Status<select value={status} onChange={(event) => setStatus(event.target.value as PlotStatus | 'ALL')}><option value="ALL">All statuses</option>{statuses.map((item) => <option key={item} value={item}>{statusLabels[item]}</option>)}</select></label><label>Facing<select value={facing} onChange={(event) => setFacing(event.target.value)}><option value="ALL">Any direction</option>{['North', 'South', 'East', 'West', 'North-east', 'North-west', 'South-east', 'South-west'].map((item) => <option key={item}>{item}</option>)}</select></label><div className="filter-pair"><label>Min area<input type="number" min="0" value={minArea} onChange={(event) => setMinArea(event.target.value)} placeholder="0" /></label><label>Max area<input type="number" min="0" value={maxArea} onChange={(event) => setMaxArea(event.target.value)} placeholder="Any" /></label></div><div className="filter-pair"><label>Min price<input type="number" min="0" value={minPrice} onChange={(event) => setMinPrice(event.target.value)} placeholder="₹0" /></label><label>Max price<input type="number" min="0" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} placeholder="Any" /></label></div><button className="filter-clear" onClick={() => { setStatus('ALL'); setFacing('ALL'); setMinArea(''); setMaxArea(''); setMinPrice(''); setMaxPrice('') }}>Clear filters</button></div>}
        <div className="viewer-inventory"><div className="viewer-inventory-head"><span>AVAILABILITY</span><span>{visible.length} / {plots.length}</span></div><div className="viewer-availability-bar">{statuses.map((item) => <i key={item} style={{ width: `${plots.length ? counts[item] / plots.length * 100 : 0}%`, background: project.colors[item] ?? defaultColors[item] }} />)}</div>{statuses.map((item) => <button key={item} className={`viewer-status-row${status === item ? ' active' : ''}`} onClick={() => setStatus(status === item ? 'ALL' : item)}><i style={{ background: project.colors[item] ?? defaultColors[item] }} /><span>{statusLabels[item]}</span><strong>{counts[item]}</strong></button>)}</div>
        <div className="viewer-results-head"><span>LAYOUT MATCHES</span><span>{visible.length}</span></div><div className="viewer-results">{visible.slice(0, 50).map((plot) => <button key={plot.id} className={`viewer-result${selectedId === plot.id ? ' active' : ''}`} onClick={() => selectPlot(plot)}><i style={{ background: project.colors[plot.status] ?? defaultColors[plot.status] }} /><span><strong>{plot.plotNumber}</strong><small>{plot.area} {plot.areaUnit}{plot.facing ? ` · ${plot.facing}` : ''}</small></span><b>{plot.price ? money.format(plot.price) : 'Price on request'}</b></button>)}{visible.length === 0 && <p className="viewer-empty">No plots match these filters.</p>}</div>
        <footer className="viewer-side-foot"><span>INTERACTIVE MASTERPLAN</span><span>{project.slug}</span></footer>
      </aside>}
      <section className="viewer-map-stage"><div className="viewer-map-heading"><div><span>{project.location.toUpperCase()}</span><strong>{project.name}</strong></div><span className="viewer-map-count"><i />{plots.length} PLOTS</span></div><div className="viewer-map" ref={mapRef}>
        <svg ref={svgRef} viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`} onPointerDown={panStart} onPointerMove={panMove} onPointerLeave={() => setHoverInfo(null)} onPointerUp={() => { panRef.current = null }} onPointerCancel={() => { panRef.current = null }} onWheel={(event) => { event.preventDefault(); zoom(event.deltaY < 0 ? 1.12 : .89) }} onDoubleClick={(event) => { const matrix = svgRef.current?.getScreenCTM(); if (matrix) { const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()); zoom(1.5, point) } }}>
          <image href={project.layoutUrl} x="0" y="0" width={project.layoutWidth} height={project.layoutHeight} preserveAspectRatio="xMidYMid meet" />
          {project.layout.layers?.roads?.visible !== false && <g>{hasObjects.filter((item) => item.kind === 'road' && item.visible !== false).map((road) => road.kind === 'road' ? <g key={road.id} data-map-location={road.name} data-map-kind={`${road.width}m road`}><path d={road.points.map((point, index) => `${index ? 'L' : 'M'} ${point.x * project.layoutWidth} ${point.y * project.layoutHeight}`).join(' ')} fill="none" stroke={road.color} strokeWidth={road.width} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" /><text className="viewer-road-label" x={road.points[0].x * project.layoutWidth} y={road.points[0].y * project.layoutHeight}>{road.name} · {road.width}m</text></g> : null)}</g>}
          {plotsVisible && project.layout.layers?.plots?.visible !== false && <g>{visible.map((plot) => { const label = plot.labelPosition ?? polygonInteriorPoint(plot.coordinates); return <g key={plot.id} data-plot-id={plot.id} className={`viewer-plot${selectedId === plot.id ? ' selected' : ''}`} onClick={(event) => { event.stopPropagation(); setSelectedId(plot.id) }}><polygon points={plot.coordinates.map((point) => `${point.x * project.layoutWidth},${point.y * project.layoutHeight}`).join(' ')} fill={project.colors[plot.status] ?? defaultColors[plot.status]} fillOpacity={selectedId === plot.id ? '.76' : '.61'} stroke={selectedId === plot.id ? '#fff' : '#f5f0e5'} strokeWidth={selectedId === plot.id ? 3 : 1.5} vectorEffect="non-scaling-stroke"><title>{plot.plotNumber} · {plot.area} {plot.areaUnit} · {plot.facing || 'Facing not set'} · {statusLabels[plot.status]}</title></polygon><text x={label.x * project.layoutWidth} y={label.y * project.layoutHeight} textAnchor="middle" dominantBaseline="central" fontSize={Math.max(11, view.width * .012)} pointerEvents="none">{plot.plotNumber}</text></g> })}</g>}
          {amenitiesVisible && project.layout.layers?.amenities?.visible !== false && hasObjects.filter((item) => item.kind === 'amenity' && item.visible !== false).map((item) => item.kind === 'amenity' ? <g key={item.id} data-map-location={item.name} data-map-kind={item.amenityType} className="viewer-amenity" transform={`translate(${item.x * project.layoutWidth} ${item.y * project.layoutHeight})`}><circle r={Math.max(12, view.width * .014)} /><text y="1" textAnchor="middle" dominantBaseline="central">{item.amenityType.slice(0, 1)}</text><text className="viewer-amenity-name" y={Math.max(27, view.width * .028)} textAnchor="middle">{item.name}</text></g> : null)}
          {project.layout.layers?.labels?.visible !== false && hasObjects.filter((item) => item.kind === 'label' && item.visible !== false).map((item) => item.kind === 'label' ? <text key={item.id} data-map-location={item.text} data-map-kind="Site label" className="viewer-custom-label" x={item.x * project.layoutWidth} y={item.y * project.layoutHeight} fontSize={item.fontSize} textAnchor="middle" transform={`rotate(${item.rotation} ${item.x * project.layoutWidth} ${item.y * project.layoutHeight})`}>{item.text}</text> : null)}
        </svg>
        {hoverInfo && <div className="viewer-hover-card" role="tooltip" style={{ left: hoverInfo.x, top: hoverInfo.y }}>
          {(() => {
            const plot = plots.find((item) => item.id === hoverInfo.plotId)
            const inPlan = hoverInfo.mapX >= 0 && hoverInfo.mapX <= project.layoutWidth && hoverInfo.mapY >= 0 && hoverInfo.mapY <= project.layoutHeight
            return <>
              <div className="viewer-hover-heading"><span>{plot ? 'PLOT AVAILABILITY' : hoverInfo.locationName ? hoverInfo.locationKind : 'MAP LOCATION'}</span>{plot && <i style={{ background: project.colors[plot.status] ?? defaultColors[plot.status] }} />}</div>
              {plot ? <><strong className="viewer-hover-title">{plot.plotNumber}</strong><span className={`viewer-hover-status ${plot.status.toLowerCase()}`}>{statusLabels[plot.status]}</span><div className="viewer-hover-facts"><span>{plot.area} {plot.areaUnit}</span><span>{plot.facing || 'Facing not set'}</span></div><strong className="viewer-hover-price">{plot.price ? money.format(plot.price) : 'Price on request'}</strong></>
                : <><strong className="viewer-hover-title">{hoverInfo.locationName || (inPlan ? 'No plot at this point' : 'Outside site plan')}</strong>{hoverInfo.locationKind && <span className="viewer-hover-kind">{hoverInfo.locationKind}</span>}</>}
              <span className="viewer-hover-coordinates">X {Math.round(hoverInfo.mapX).toLocaleString()} · Y {Math.round(hoverInfo.mapY).toLocaleString()}</span>
            </>
          })()}
        </div>}
        <div className="viewer-action-rail">
          <button onClick={() => setAmenitiesVisible(!amenitiesVisible)} aria-pressed={amenitiesVisible}><MapPin size={15} /> Amenities</button>
          <button onClick={() => setGalleryOpen(true)}><Images size={15} /> Gallery</button>
          <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(project.location)}`} target="_blank" rel="noreferrer"><MapPin size={15} /> Location</a>
        </div>
        <div className="viewer-map-controls"><button onClick={() => zoom(1.2)} aria-label="Zoom in"><ZoomIn size={17} /></button><span>{Math.round(project.layoutWidth / view.width * 100)}%</span><button onClick={() => zoom(.83)} aria-label="Zoom out"><ZoomOut size={17} /></button><button onClick={fit} aria-label="Fit layout"><LocateFixed size={16} /></button><button onClick={() => setPlotsVisible(!plotsVisible)} aria-label={plotsVisible ? 'Hide plot boundaries' : 'Show plot boundaries'} aria-pressed={plotsVisible}>{plotsVisible ? <Eye size={16} /> : <EyeOff size={16} />}</button></div><div className="viewer-map-compass"><Compass size={18} /><span>N</span></div><div className="viewer-map-legend">{statuses.map((item) => <span key={item}><i style={{ background: project.colors[item] ?? defaultColors[item] }} />{statusLabels[item]}</span>)}</div><span className="viewer-map-hint">Drag to move · scroll to zoom · select a plot</span>
      </div></section>
      {selected && <aside className="plot-detail-panel"><div className="plot-detail-head"><div><span className="eyebrow">PLOT DETAILS</span><h2>{selected.plotNumber}</h2></div><button onClick={() => setSelectedId(null)} aria-label="Close plot details"><X size={17} /></button></div><span className={`plot-status-badge ${selected.status.toLowerCase()}`}><i style={{ background: project.colors[selected.status] ?? defaultColors[selected.status] }} />{statusLabels[selected.status]}</span><div className="plot-price">{selected.price ? money.format(selected.price) : 'Price on request'}<small>{selected.pricePerUnit ? `${money.format(selected.pricePerUnit)} / ${selected.areaUnit}` : 'TOTAL CONSIDERATION'}</small></div><div className="plot-spec-grid"><div><span>AREA</span><strong>{selected.area} {selected.areaUnit}</strong></div><div><span>FACING</span><strong>{selected.facing || 'Not set'}</strong></div><div><span>BLOCK</span><strong>{selected.block || '—'}</strong></div><div><span>ROAD</span><strong>{selected.roadWidth ? `${selected.roadWidth} road` : 'Not set'}</strong></div></div>{selected.description && <p className="plot-description">{selected.description}</p>}{selected.images.length > 0 && <button className="plot-gallery-link" onClick={() => setGalleryOpen(true)}><Images size={14} /> View {selected.images.length} plot photo{selected.images.length === 1 ? '' : 's'}</button>}{enquiryUrl ? <a className="viewer-enquire-button" href={enquiryUrl} target={project.whatsappNumber ? '_blank' : undefined} rel="noreferrer">Enquire about {selected.plotNumber}<ArrowUpRight size={16} /></a> : <p className="viewer-contact-missing">Contact details haven’t been added yet.</p>}<small className="detail-contact-note">{project.contactNumber ? `Project desk · ${project.contactNumber}` : 'Our project team will be in touch.'}</small></aside>}
    </div>
    {galleryOpen && <div className="viewer-gallery-backdrop" role="presentation" onClick={() => setGalleryOpen(false)}><section className="viewer-gallery-dialog" role="dialog" aria-modal="true" aria-labelledby="viewer-gallery-title" onClick={(event) => event.stopPropagation()}><div className="viewer-gallery-heading"><div><span className="eyebrow">PROJECT PHOTOS</span><h2 id="viewer-gallery-title">Gallery</h2></div><button onClick={() => setGalleryOpen(false)} aria-label="Close gallery"><X size={18} /></button></div>{galleryImages.length ? <div className="viewer-gallery-grid">{galleryImages.map(({ image, plot }, index) => <figure key={`${plot.id}-${image}-${index}`}><img src={image} alt={`${project.name} plot ${plot.plotNumber}`} /><figcaption>Plot {plot.plotNumber}</figcaption></figure>)}</div> : <p className="viewer-gallery-empty">No plot photos have been added to this project yet.</p>}</section></div>}
    {preview && <a className="preview-ribbon" href={`/admin/projects`}>PREVIEW MODE · ADMIN ONLY <ArrowUpRight size={13} /></a>}
  </main>
}
