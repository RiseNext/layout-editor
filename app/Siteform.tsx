'use client'

import dynamic from 'next/dynamic'

const Router = dynamic(() => import('../src/Router'), {
  ssr: false,
  loading: () => <div className="studio-loading"><span className="loading-mark" />Opening project studio</div>,
})

export default function Siteform() {
  return <Router />
}