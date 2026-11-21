import { version } from '../package.json';
import manifest from '../manifest.json';
import { createApp } from 'vue';
import { h, ref, shallowRef, nextTick, watch } from 'vue';
import App from '@/App.vue';
import '@/styles.css';
import '@/ui/blue-glass.css';
import '@/ui/record-pages.css';
import '@/ui/smell-media.css';
import '@/ui/qqj-settings.css';
import '@/ui/api-settings.css';
import {createGeneralSettings} from '@/host/general-settings';
import {createPluginUpdates} from '@/ui/native-settings.js';
import {jsonRequestHeaders} from '@/host/request-headers';
import { getHostContext } from '@/host/host-context';
import { createQQJPeopleReader } from '@/sources/qqj-people';
import { createQQJReadinessReader } from '@/sources/qqj-readiness';
import { createQQJQuestionMaterialReader } from '@/sources/qqj-context';
import { createStoryInputReader } from '@/host/story-input';
import {createWorldSettingsReader} from '@/host/world-settings';
import { createStoryHistoryReader } from '@/host/story-history';
import { createWorldRepository } from '@/storage/world-repository';
import { createBainiaoClient } from '@/storage/bainiao-client';
import { createPublicMessageRepository } from '@/storage/public-message-repository';
import { createConfigService } from '@/models/config';
import { createModelRequester } from '@/models/client';
import { advanceBatch } from '@/simulation/advance';
import { createAppearanceSettings } from '@/host/appearance-settings';
import { createAppearanceController, type AppearanceState } from '@/ui/appearance';
import { createFab } from '@/ui/fab';
import { defaultFabPosition } from '@/ui/fab-presentation';
import { createPluginSettings } from '@/host/plugin-settings';
import type { AppearancePreferences } from '@/host/appearance-settings';
import {createDevelopmentDiagnostics} from '@/diagnostics/development';
import brandLogo from '@/visuals/baimian-logo.svg?raw';

const HOST_ID = 'dollars-world-host';
const MENU_ITEM_ID = 'dollars-world-open';
const reader = createQQJPeopleReader();
const materialReader = createQQJQuestionMaterialReader();
const bainiao = createBainiaoClient();
const repository = createWorldRepository(bainiao);
const config = createConfigService();
const enabledSettings = createPluginSettings();
const buildRevision = new URL(import.meta.url).searchParams.get('rev');
const dependencies = {
  diagnostics:createDevelopmentDiagnostics({version:buildRevision?`${version}+${buildRevision}`:version}),
  directory: reader, repository, publicMessages: createPublicMessageRepository(bainiao), story: createStoryInputReader(), history: createStoryHistoryReader(), readiness:createQQJReadinessReader(), config,
  createModelRequester,
  materials: materialReader,
  worldSettings:createWorldSettingsReader(),
  advancer: { advance: advanceBatch },
};
const visible = ref(false);
const appearanceSettings = createAppearanceSettings();
let general:ReturnType<typeof createGeneralSettings>,updates:any,renderMarkdown:(value:string)=>string;

let panelTrigger: HTMLElement | null = null;
function closePanel(restoreFocus = true) {
  visible.value = false;
  const previous = panelTrigger; panelTrigger = null;
  if (restoreFocus) void nextTick(() => previous?.focus({ preventScroll: true }));
}
function togglePanel(event?: Event) {
  if (visible.value) { closePanel(); return; }
  panelTrigger = event?.currentTarget as HTMLElement ?? null;
  visible.value = true;
}

function mountPanel() {
  let host = document.getElementById(HOST_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = HOST_ID;
    document.body.appendChild(host);
  }
  host.style.setProperty('display', 'block', 'important');
  host.style.position = 'fixed';
  host.style.inset = '0';
  host.style.zIndex = 'var(--bmx-panel-layer, 10060)';
  host.style.pointerEvents = 'none';
  const preferences = shallowRef(appearanceSettings.get());
  const appearance = shallowRef<AppearanceState>();
  const fab = createFab({ presentation: { icon: brandLogo, defaultPosition: defaultFabPosition }, onClick: togglePanel });
  document.body.appendChild(fab.host);
  function syncFab() {
    fab.setVisible(enabledSettings.isEnabled(), preferences.value.fabShow);
  }
  const appearanceController = createAppearanceController({
    host, settings: appearanceSettings, deferFont: true,
    onChange(value) {
      appearance.value = value;
      fab.setAppearance(value.apiPalette, value.scale);
    },
  });
  function saveAppearance(patch: Partial<AppearancePreferences>) {
    appearanceSettings.save(patch);
    preferences.value = appearanceSettings.get();
    appearanceController.apply();
    syncFab();
  }
  function destroyAppearance() {
    appearanceController.destroy();
    stopVisibilityWatch();
    fab.destroy();
  }
  syncFab();

  const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
  const icons = document.createElement('link');
  icons.rel = 'stylesheet';
  icons.href = '/css/fontawesome.min.css';
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  const cssUrl = new URL(/* @vite-ignore */ './index.css', import.meta.url);
  cssUrl.search = new URL(import.meta.url).search;
  stylesheet.href = cssUrl.href;
  const container = document.createElement('div');
  container.style.display = 'none';
  stylesheet.addEventListener('load', () => {
    container.style.removeProperty('display');
    if(visible.value)container.querySelector<HTMLButtonElement>('[aria-label="关闭百面相"]')?.focus({preventScroll:true});
  }, { once: true });
  shadow.replaceChildren(container);
  const stopVisibilityWatch=watch(visible,open=>{
    fab.setPanelOpen(open);
    if(!open)return;
    if(!stylesheet.isConnected)shadow.prepend(icons,stylesheet);
    appearanceController.loadFont();
  },{flush:'sync'});
  createApp({
    setup: () => () => h(App, { dependencies, materialReader, config, enabledSettings, appearance: appearance.value!, preferences: preferences.value, saveAppearance, destroyAppearance, syncFab, general, updates, renderMarkdown, visible: visible.value, onClose: closePanel }),
  }).mount(container);
}

function installMenuItem() {
  const tryInstall = () => {
    const menu = document.querySelector('#sp_wand_container') || document.querySelector('#extensionsMenu');
    if (!menu) return false;
    if (document.getElementById(MENU_ITEM_ID)) return true;
    const item = document.createElement('div');
    item.id = MENU_ITEM_ID;
    item.className = 'list-group-item flex-container flexGap5';
    Object.assign(item.style, { display: 'flex', flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center', whiteSpace: 'nowrap' });
    item.setAttribute('role', 'button');
    item.tabIndex = 0;
    const icon = document.createElement('span');
    icon.className = 'extensionsMenuExtensionButton';
    Object.assign(icon.style, { width: '20px', height: '20px', flex: '0 0 20px' });
    icon.innerHTML = brandLogo;
    Object.assign((icon.firstElementChild as SVGSVGElement).style, { width: '18px', height: '18px', display: 'block' });
    (icon.firstElementChild as SVGSVGElement).setAttribute('stroke-width', '0.777778');
    const label = document.createElement('span');
    label.textContent = '百面相';
    item.append(icon, label);
    item.addEventListener('click', togglePanel);
    item.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); togglePanel(event); } });
    menu.appendChild(item);
    return true;
  };

  if (tryInstall()) return;
  const observer = new MutationObserver(() => {
    if (tryInstall()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 30_000);
}

async function initialize(tries = 0) {
  if (getHostContext()) {
    general=createGeneralSettings();
    const origin=globalThis.location.href;
    const [extensions,library]=await Promise.all([import(/* @vite-ignore */new URL('/scripts/extensions.js',origin).href),import(/* @vite-ignore */new URL('/lib.js',origin).href)]);
    updates=createPluginUpdates({moduleUrl:import.meta.url,extensionTypes:()=>extensions.extensionTypes,noticePath:manifest.update_notice,headers:()=>jsonRequestHeaders(getHostContext()?.getRequestHeaders?.()??{})});
    renderMarkdown=value=>library.DOMPurify.sanitize(new library.showdown.Converter().makeHtml(value),{FORBID_TAGS:['img','iframe','object','embed','style','form'],FORBID_ATTR:['style']});
    mountPanel();
    installMenuItem();
    console.info(`[Dollars] 百面相 ${version} 已加载`);
    return;
  }
  if (tries < 150) setTimeout(() => initialize(tries + 1), 200);
}

initialize();
