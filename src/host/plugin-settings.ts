import { getHostContext } from './host-context';
import {defaultSmellSchedule,type SmellSchedule} from '../domain/public-messages';

export function createPluginSettings(getContext = getHostContext) {
  return {
    getSmellSchedule(scopeId:string):SmellSchedule {
      const settings=getContext()?.extensionSettings?.['st-dollars'] as {smellSchedules?:Record<string,Partial<SmellSchedule>>}|undefined;
      const schedule=settings?.smellSchedules?.[scopeId];
      return {
        everyReplies:typeof schedule?.everyReplies==='number'&&Number.isSafeInteger(schedule.everyReplies)&&schedule.everyReplies>0?schedule.everyReplies:defaultSmellSchedule.everyReplies,
        enabledAfter:typeof schedule?.enabledAfter==='number'&&Number.isSafeInteger(schedule.enabledAfter)&&schedule.enabledAfter>=0?schedule.enabledAfter:null,
      };
    },
    saveSmellSchedule(scopeId:string,schedule:SmellSchedule) {
      const context=getContext(),settings=context?.extensionSettings;
      if(!settings||typeof context?.saveSettingsDebounced!=='function')throw Error('当前无法保存嗅的更新设置。');
      const existing=settings['st-dollars'];
      const own=existing&&typeof existing==='object'?existing as Record<string,unknown>:{};
      const stored=own.smellSchedules;
      const schedules=stored&&typeof stored==='object'&&!Array.isArray(stored)?stored:{};
      settings['st-dollars']={...own,smellSchedules:{...schedules,[scopeId]:schedule}};
      context.saveSettingsDebounced();
    },
    hearingInjectionEnabled():boolean {
      const own=getContext()?.extensionSettings?.['st-dollars'] as Record<string,unknown>|undefined;
      return own?.hearingInjection===true;
    },
    saveHearingInjection(enabled:boolean) {
      const context=getContext(),settings=context?.extensionSettings;
      if(!settings||typeof context?.saveSettingsDebounced!=='function')throw Error('无法保存正文注入开关。');
      const own=settings['st-dollars'];
      settings['st-dollars']={...(own&&typeof own==='object'?own:{}),hearingInjection:enabled};
      context.saveSettingsDebounced();
    },
    getEveryReplies(): number {
      const own = getContext()?.extensionSettings?.['st-dollars'] as Record<string, unknown> | undefined;
      const value = own?.developmentEveryReplies;
      return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : 1;
    },
    saveEveryReplies(value: number): void {
      if (!Number.isSafeInteger(value) || value < 1) throw new Error('请输入正整数回复数。');
      const context = getContext(); const settings = context?.extensionSettings;
      if (!settings || typeof context?.saveSettingsDebounced !== 'function') throw new Error('无法保存更新间隔，请重新输入。');
      const own = settings['st-dollars'];
      settings['st-dollars'] = {...(own && typeof own === 'object' ? own : {}), developmentEveryReplies: value};
      context.saveSettingsDebounced();
    },
    isEnabled(): boolean {
      const own = getContext()?.extensionSettings?.['st-dollars'];
      return !(own && typeof own === 'object' && (own as Record<string, unknown>).pluginEnabled === false);
    },
    saveEnabled(enabled: boolean): void {
      const context = getContext();
      const settings = context?.extensionSettings;
      if (!context || !settings || typeof context.saveSettingsDebounced !== 'function') throw new Error('无法保存百面相开关设置。');
      const current = settings['st-dollars'];
      const own = current && typeof current === 'object' ? current as Record<string, unknown> : {};
      settings['st-dollars'] = { ...own, pluginEnabled: enabled };
      context.saveSettingsDebounced();
    },
  };
}
