import {watch,type Ref} from 'vue';
import type {DevelopmentView} from '../application/development';

interface HostToasts {
  error(message:string,title:string,options:{escapeHtml:boolean}):unknown;
  remove?(toast:unknown):void;
}

export function watchDevelopmentFailure(view:Readonly<Ref<DevelopmentView>>) {
  return watch(
    () => view.value.status === 'error' ? view.value.error : '',
    (error,_previous,onCleanup) => {
      if (!error) return;
      const toastr = (globalThis as {toastr?:HostToasts}).toastr;
      if (!toastr) return;
      const {started,canSave,needsReload} = view.value;
      const title = started ? '百面相自动流转已暂停' : '百面相更新失败';
      const action = canSave ? '重新保存' : needsReload ? '重新读取' : '百相流转';
      const toast = toastr.error(`${error} 可到百面相的「设置 → 世界观」点击「${action}」。`,title,{escapeHtml:true});
      if (toast) onCleanup(() => toastr.remove?.(toast));
    },
  );
}
