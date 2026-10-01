/**
 * Clock & World Timezones Module
 * Handles real-time digital clocks for Tehran and global financial hubs
 * Includes accurate Persian (Solar Hijri / Shamsi) calendar formatting
 */

class WorldClock {
  constructor() {
    this.zones = [
      { id: 'tehran', cityFa: 'تهران', cityEn: 'Tehran', flag: '🇮🇷', tz: 'Asia/Tehran', label: 'IRST (UTC+3:30)' },
      { id: 'utc', cityFa: 'ساعت هماهنگ جهانی', cityEn: 'UTC Time', flag: '🌐', tz: 'UTC', label: 'UTC' },
      { id: 'london', cityFa: 'لندن', cityEn: 'London', flag: '🇬🇧', tz: 'Europe/London', label: 'BST / GMT' },
      { id: 'newyork', cityFa: 'نیویورک', cityEn: 'New York', flag: '🇺🇸', tz: 'America/New_York', label: 'EDT / EST' },
      { id: 'tokyo', cityFa: 'توکیو', cityEn: 'Tokyo', flag: '🇯🇵', tz: 'Asia/Tokyo', label: 'JST (UTC+9)' },
      { id: 'dubai', cityFa: 'دبی', cityEn: 'Dubai', flag: '🇦🇪', tz: 'Asia/Dubai', label: 'GST (UTC+4)' }
    ];

    this.tehranHoursEl = document.getElementById('tehran-hours-min');
    this.tehranSecEl = document.getElementById('tehran-sec');
    this.shamsiDateEl = document.getElementById('shamsi-date');
    this.gregorianDateEl = document.getElementById('gregorian-date');
    this.secondaryTzListEl = document.getElementById('secondary-tz-list');

    this.timer = null;
    this.init();
  }

  init() {
    this.renderSecondaryList();
    this.update();
    this.timer = setInterval(() => this.update(), 1000);
  }

  update() {
    const now = new Date();

    // 1. Update Primary Tehran Digital Clock
    const tehranTimeStr = now.toLocaleTimeString('en-US', {
      timeZone: 'Asia/Tehran',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    const [hh, mm, ss] = tehranTimeStr.split(':');
    if (this.tehranHoursEl) {
      this.tehranHoursEl.textContent = `${hh}:${mm}`;
    }
    if (this.tehranSecEl) {
      this.tehranSecEl.textContent = `:${ss}`;
    }

    // 2. Persian Shamsi Date
    try {
      const faFormatter = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
        timeZone: 'Asia/Tehran',
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      if (this.shamsiDateEl) {
        this.shamsiDateEl.textContent = faFormatter.format(now);
      }
    } catch (e) {
      if (this.shamsiDateEl) this.shamsiDateEl.textContent = 'ایران - تهران';
    }

    // Gregorian Date
    if (this.gregorianDateEl) {
      const enFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Tehran',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
      this.gregorianDateEl.textContent = enFormatter.format(now);
    }

    // 3. Update Secondary Timezones
    this.zones.forEach(z => {
      const el = document.getElementById(`tz-val-${z.id}`);
      if (el) {
        el.textContent = now.toLocaleTimeString('en-US', {
          timeZone: z.tz,
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
      }
    });
  }

  renderSecondaryList() {
    if (!this.secondaryTzListEl) return;
    this.secondaryTzListEl.innerHTML = '';

    // Show zones other than tehran
    const filtered = this.zones.filter(z => z.id !== 'tehran');
    filtered.forEach(z => {
      const item = document.createElement('div');
      item.className = 'tz-item';
      item.innerHTML = `
        <span class="tz-flag">${z.flag}</span>
        <span class="tz-name">${z.cityFa}</span>
        <span class="tz-time" id="tz-val-${z.id}">--:--:--</span>
      `;
      this.secondaryTzListEl.appendChild(item);
    });
  }
}

window.WorldClock = WorldClock;
