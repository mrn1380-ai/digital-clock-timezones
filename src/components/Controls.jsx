import React from 'react'
import { FEE_LEVELS } from '../lib/fees.js'
import { TRANSPORTS } from '../lib/sources.js'

export default function Controls({ settings, setSettings, state, lastMs, lastTs, onRefresh, sourceId, setSourceId, logCount }) {
  const set = (patch) => setSettings((s) => ({ ...s, ...patch }))

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="card-head">
        <div>
          <h2>تنظیمات و اتصال</h2>
          <div className="sub">مدل هزینه، نمونه‌برداری خودکار و انتخاب منبع داده</div>
        </div>
        <div className="inline">
          <span className={`badge ${state === 'ok' ? 'ok' : state === 'loading' ? 'info' : state === 'error' ? 'bad' : ''}`}>
            {state === 'ok' ? 'متصل' : state === 'loading' ? 'دریافت…' : state === 'error' ? 'خطا در اتصال' : 'آماده'}
            {lastMs != null && state === 'ok' ? ` · ${lastMs}ms` : ''}
          </span>
          <button className="primary" onClick={onRefresh} disabled={state === 'loading'}>
            {state === 'loading' ? <span className="spinner" /> : '↻'} دریافت جدید
          </button>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
        <label className="field">
          منبع داده
          <select value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
            <option value="auto">خودکار (تلاش به ترتیب)</option>
            {TRANSPORTS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          سطح کاربری (کارمزد)
          <select
            value={settings.feeLevel}
            onChange={(e) =>
              set({
                feeLevel: e.target.value,
                customFees:
                  e.target.value === 'custom'
                    ? settings.customFees || { IRT: { maker: 0.2, taker: 0.25 }, USDT: { maker: 0.1, taker: 0.13 } }
                    : settings.customFees,
              })
            }
          >
            {FEE_LEVELS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
            <option value="custom">سفارشی…</option>
          </select>
        </label>

        <label className="field">
          نوع اجرا
          <select value={settings.side} onChange={(e) => set({ side: e.target.value })}>
            <option value="taker">تیکر (سفارش بازار)</option>
            <option value="maker">میکر (سفارش‌گذار)</option>
          </select>
        </label>

        <label className="field">
          سناریوی هزینه
          <select value={settings.costMode} onChange={(e) => set({ costMode: e.target.value })}>
            <option value="roundtrip">رفت‌وبرگشت (خرید+فروش)</option>
            <option value="oneway">یک‌طرفه</option>
          </select>
        </label>

        <label className="field">
          بازارها
          <select value={settings.quotes.join(',')} onChange={(e) => set({ quotes: e.target.value ? e.target.value.split(',') : [] })}>
            <option value="IRT,USDT">ریالی + تتری</option>
            <option value="IRT">فقط ریالی</option>
            <option value="USDT">فقط تتری</option>
          </select>
        </label>

        <label className="field">
          حداقل حجم ۲۴س (دلار)
          <select value={settings.minVolumeUsd} onChange={(e) => set({ minVolumeUsd: Number(e.target.value) })}>
            {[0, 100, 1000, 10000, 100000].map((v) => (
              <option key={v} value={v}>
                {v === 0 ? 'بدون محدودیت' : v.toLocaleString('en-US') + ' $'}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          نمونه‌برداری خودکار
          <select value={settings.intervalSec} onChange={(e) => set({ intervalSec: Number(e.target.value) })}>
            {[15, 30, 60, 120, 300].map((v) => (
              <option key={v} value={v}>
                هر {v} ثانیه
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          وضعیت نمونه‌برداری
          <button onClick={() => set({ autoSample: !settings.autoSample })} style={{ padding: '7px 11px' }}>
            {settings.autoSample ? '⏸ توقف خودکار' : '▶ شروع خودکار'}
          </button>
        </label>

        <label className="field">
          بازارهای بسته
          <button onClick={() => set({ includeClosed: !settings.includeClosed })} style={{ padding: '7px 11px' }}>
            {settings.includeClosed ? 'نمایش داده می‌شود' : 'حذف می‌شوند'}
          </button>
        </label>
      </div>

      {settings.feeLevel === 'custom' && settings.customFees && (
        <div className="divider" />
      )}
      {settings.feeLevel === 'custom' && settings.customFees && (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          {['IRT', 'USDT'].map((q) => ['maker', 'taker'].map((side) => (
            <label className="field" key={q + side}>
              کارمزد {side === 'maker' ? 'میکر' : 'تیکر'} {q === 'IRT' ? 'ریالی' : 'تتری'} (٪)
              <input
                type="number"
                step="0.001"
                value={settings.customFees[q][side]}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    customFees: { ...s.customFees, [q]: { ...s.customFees[q], [side]: Number(e.target.value) } },
                  }))
                }
              />
            </label>
          )))}
        </div>
      )}

      <div className="note" style={{ marginTop: 10 }}>
        سناریوی فعلی:{' '}
        <b>
          {settings.side === 'taker' ? 'تیکر' : 'میکر'} · {settings.costMode === 'roundtrip' ? 'رفت‌وبرگشت' : 'یک‌طرفه'}
        </b>{' '}
        — برای تیکرِ رفت‌وبرگشت: <span className="mono">هزینه کل = اسپرد + ۲ × کارمزد</span>؛ برای تیکرِ یک‌طرفه:{' '}
        <span className="mono">هزینه کل = ½ اسپرد + کارمزد</span>. برای میکر اسپرد پرداخت نمی‌شود (اما ریسک عدم پر شدن دارد).
        {lastTs && <span className="right"> آخرین دریافت: {new Date(lastTs).toLocaleTimeString('fa-IR', { hour12: false })}</span>}
      </div>
    </div>
  )
}
