import React from 'react'
import { renderToString } from 'react-dom/server'
import App from '../src/App.jsx'

const html = renderToString(<App />)
console.log('SSR OK, html length =', html.length)
if (!html.includes('داشبورد')) throw new Error('محتوای مورد انتظار رندر نشد')
