export type ProjectStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
export type PlotStatus = 'AVAILABLE' | 'RESERVED' | 'SOLD' | 'HOLD' | 'BLOCKED'
export type LayerName = 'base' | 'roads' | 'plots' | 'amenities' | 'labels'
export type Point = { x: number; y: number }

export type Plot = {
  id: string
  plotNumber: string
  block: string
  area: number
  areaUnit: string
  width: number
  length: number
  facing: string
  roadWidth: string
  price: number
  pricePerUnit: number
  status: PlotStatus
  description: string
  coordinates: Point[]
  labelPosition: Point | null
  images: string[]
}

export type RoadObject = {
  id: string
  kind: 'road'
  name: string
  roadType: string
  width: number
  color: string
  points: Point[]
  visible: boolean
  locked: boolean
}

export type AmenityObject = {
  id: string
  kind: 'amenity'
  name: string
  amenityType: string
  x: number
  y: number
  visible: boolean
  locked: boolean
}

export type LabelObject = {
  id: string
  kind: 'label'
  name: string
  text: string
  x: number
  y: number
  fontSize: number
  rotation: number
  visible: boolean
  locked: boolean
}

export type LayoutObject = RoadObject | AmenityObject | LabelObject
export type LayoutDocument = {
  objects: LayoutObject[]
  layers: Record<LayerName, { visible: boolean; locked: boolean }>
  settings: Record<string, unknown>
}

export type Project = {
  id: string
  slug: string
  name: string
  location: string
  description: string
  contactNumber: string
  whatsappNumber: string
  layoutWidth: number
  layoutHeight: number
  layoutUrl: string
  status: ProjectStatus
  colors: Record<PlotStatus, string>
  layout: LayoutDocument
  createdAt: string
  updatedAt: string
}

export const defaultColors: Record<PlotStatus, string> = {
  AVAILABLE: '#82bd70',
  RESERVED: '#e8a04e',
  SOLD: '#d56c62',
  HOLD: '#e3c55c',
  BLOCKED: '#929b96',
}

export const defaultLayers: LayoutDocument['layers'] = {
  base: { visible: true, locked: true },
  roads: { visible: true, locked: false },
  plots: { visible: true, locked: false },
  amenities: { visible: true, locked: false },
  labels: { visible: true, locked: false },
}

export const emptyLayout = (): LayoutDocument => ({
  objects: [],
  layers: structuredClone(defaultLayers),
  settings: {},
})

export const statusLabels: Record<PlotStatus, string> = {
  AVAILABLE: 'Available',
  RESERVED: 'Reserved',
  SOLD: 'Sold',
  HOLD: 'On hold',
  BLOCKED: 'Blocked',
}
