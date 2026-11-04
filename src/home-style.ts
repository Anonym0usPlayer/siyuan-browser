/** Home page stylesheet.
 *
 * The page renders inside a shadow root, so this sheet is the only thing that
 * can style it: host classes and third-party themes cannot reach these nodes at
 * all. Everything the page needs is therefore declared here, including a small
 * reset and the layout controls that are also shown in the plugin settings.
 */
export const homeStyle = String.raw`
:host {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  /* The tab body can be much narrower than the window (split view), so the
   * padding, the popover width and the column count all measure the host, not
   * the viewport. */
  container-type: inline-size;
  color: var(--b3-theme-on-background);
}
*, *::before, *::after { box-sizing: border-box; }
button, input { font: inherit; color: inherit; }
svg { display: block; }
.sb-icon { width: 16px; height: 16px; flex-shrink: 0; }

.page {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 30px clamp(18px, 4cqi, 44px) 44px;
}
.page-inner { max-width: 1080px; margin: 0 auto; }

/* ---------- header ---------- */
.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 22px;
}
.head h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.head p {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--b3-theme-on-surface);
}

.customize { position: relative; flex-shrink: 0; }
.customize > summary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  font-size: 12px;
  list-style: none;
  cursor: pointer;
  border: 1px solid var(--b3-border-color);
  border-radius: 8px;
  color: var(--b3-theme-on-background);
}
.customize > summary::-webkit-details-marker { display: none; }
.customize > summary:hover { background-color: rgba(127, 127, 127, 0.08); }
.panel {
  position: absolute;
  z-index: 3;
  right: 0;
  top: calc(100% + 8px);
  width: 320px;
  max-width: 78cqi;
  padding: 12px;
  border: 1px solid var(--b3-border-color);
  border-radius: 10px;
  background-color: var(--b3-theme-background);
  box-shadow: var(--b3-dialog-shadow);
}
.panel > p {
  margin: 0 0 10px;
  font-size: 12px;
  color: var(--b3-theme-on-surface);
}

/* ---------- search ---------- */
.search {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 25px;
}
.field {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  gap: 8px;
  height: 36px;
  padding: 0 12px;
  border: 1px solid var(--b3-border-color);
  border-radius: 9px;
  background-color: var(--b3-theme-surface);
  color: var(--b3-theme-on-surface);
}
.field:focus-within { border-color: var(--b3-theme-primary); }
.field input {
  flex: 1;
  min-width: 0;
  height: 100%;
  border: 0;
  outline: 0;
  background-color: transparent;
  color: var(--b3-theme-on-background);
  font-size: 13px;
}
.search > button {
  flex-shrink: 0;
  height: 36px;
  padding: 0 16px;
  font-size: 13px;
  cursor: pointer;
  border: 1px solid var(--b3-border-color);
  border-radius: 9px;
  background-color: transparent;
}
.search > button:hover { background-color: rgba(127, 127, 127, 0.08); }

/* ---------- sections ---------- */
.sections { column-count: 2; column-gap: 34px; }
.section {
  break-inside: avoid;
  margin: 0 0 26px;
  padding-top: 12px;
  border-top: 1px solid var(--b3-border-color);
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 26px;
  margin-bottom: 6px;
}
.section-head h2 {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}
.section-head h2 svg { color: var(--b3-theme-on-surface); }
.count { font-size: 11px; font-weight: 400; color: var(--b3-theme-on-surface); }
.actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
.icon-button {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background-color: transparent;
  color: var(--b3-theme-on-surface);
  cursor: pointer;
}
.icon-button:hover {
  background-color: rgba(127, 127, 127, 0.12);
  color: var(--b3-theme-on-background);
}

/* ---------- rows ---------- */
.list { margin: 0; padding: 0; list-style: none; }
.row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 6px 4px 4px;
  border-radius: 7px;
}
.row:hover { background-color: rgba(127, 127, 127, 0.09); }
.row-link {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  gap: 10px;
  padding: 2px 0;
  color: inherit;
  text-decoration: none;
}
.row:hover .title { text-decoration: underline; }
.site {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 5px;
  background-color: var(--b3-theme-surface);
  color: var(--b3-theme-on-surface);
  font-size: 12px;
  line-height: 1;
  overflow: hidden;
}
.site img { width: 16px; height: 16px; object-fit: contain; }
.body { display: flex; flex-direction: column; min-width: 0; }
.title, .url {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.title { font-size: 13px; line-height: 1.45; }
.url { font-size: 11px; line-height: 1.4; color: var(--b3-theme-on-surface); }
.meta {
  flex: 0 0 auto;
  min-width: 62px;
  text-align: right;
  font-size: 11px;
  color: var(--b3-theme-on-surface);
  font-variant-numeric: tabular-nums;
}
.slot { flex: 0 0 auto; width: 26px; height: 26px; }
.row .icon-button { opacity: 0; }
.row:hover .icon-button, .row:focus-within .icon-button { opacity: 1; }

.empty {
  margin: 0;
  padding: 12px 4px;
  font-size: 12px;
  color: var(--b3-theme-on-surface);
}
.more {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
  padding: 3px 2px;
  font-size: 12px;
  color: var(--b3-theme-on-surface);
  background-color: transparent;
  border: 0;
  cursor: pointer;
}
.more:hover { color: var(--b3-theme-on-background); text-decoration: underline; }

@container (max-width: 760px) { .sections { column-count: 1; } }

/* ---------- layout controls (also rendered inside the settings dialog) ---------- */
.sb-home-layout { min-width: 240px; }
.sb-home-layout-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 2px 4px;
  border-radius: 6px;
}
.sb-home-drag { display: flex; padding: 4px 0; cursor: grab; color: var(--b3-theme-on-surface); }
.sb-home-toggle {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  cursor: pointer;
}
.sb-home-drop { outline: 1px solid var(--b3-theme-primary); }
.sb-home-setting { display: flex; flex-wrap: wrap; gap: 8px; }
input[type="checkbox"] { accent-color: var(--b3-theme-primary); }
.sb-home-setting input { flex: 1; min-width: 150px; height: 30px; padding: 0 8px; border: 1px solid var(--b3-border-color); border-radius: 6px; background-color: transparent; }
`;
