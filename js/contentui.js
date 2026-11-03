/* Piyush on Finance: the forms and quick actions for the upload tracker (content.js holds the maths). */
import { plural, todayStr } from './util.js';
import { toast, form } from './components.js';
import { PLATFORMS } from './content.js';
import * as store from './store.js';

const PLAT = Object.keys(PLATFORMS).map((k) => [k, PLATFORMS[k].name]);
const urlOk = (s) => !s || /^https?:\/\/\S+$/i.test(s);

// a video or post that's out: today unless you say otherwise
export function logUpload(preset) {
  form({
    title: 'Log an upload', intro: 'A video or post that is live.',
    fields: [{ name: 'platform', label: 'Where', type: 'select', options: PLAT }, { name: 'title', label: 'What it was about', placeholder: 'How to read a balance sheet in 10 minutes', autofocus: true }, { name: 'uploadedOn', label: 'Uploaded on', type: 'date', half: true, required: true }, { name: 'link', label: 'Link (optional)', placeholder: 'https://', half: true }],
    values: Object.assign({ platform: 'youtube', uploadedOn: todayStr() }, preset),
    submitLabel: 'Log it',
    onSubmit: (v) => { if (!urlOk(v.link)) return 'The link should start with https://'; store.add('content', { platform: v.platform, title: v.title, uploadedOn: v.uploadedOn, plannedFor: null, link: v.link }, 'ct'); toast(PLATFORMS[v.platform].name + ' upload logged', { icon: 'video' }); }
  });
}
// one you intend to make: it shows as Planned, then Missed if its day passes
export function planVideo(preset) {
  form({
    title: 'Plan a video or post',
    fields: [{ name: 'platform', label: 'Where', type: 'select', options: PLAT }, { name: 'title', label: 'Topic', required: true, placeholder: 'Mutual funds for beginners', autofocus: true }, { name: 'plannedFor', label: 'Going live on', type: 'date', required: true }],
    values: Object.assign({ platform: 'youtube', plannedFor: todayStr() }, preset),
    submitLabel: 'Add to plan',
    onSubmit: (v) => { store.add('content', { platform: v.platform, title: v.title, plannedFor: v.plannedFor, uploadedOn: null, link: '' }, 'ct'); toast('Planned for ' + v.plannedFor); }
  });
}
export function editEntry(id) {
  const c = store.get('content', id); if (!c) return;
  form({
    title: 'Edit ' + PLATFORMS[c.platform].noun,
    fields: [{ name: 'platform', label: 'Where', type: 'select', options: PLAT, half: true }, { name: 'title', label: 'Title or topic' }, { name: 'plannedFor', label: 'Planned for', type: 'date', half: true }, { name: 'uploadedOn', label: 'Uploaded on (blank = not yet)', type: 'date', half: true }, { name: 'link', label: 'Link (optional)' }],
    values: c, submitLabel: 'Save',
    onSubmit: (v) => { if (!urlOk(v.link)) return 'The link should start with https://'; if (!v.uploadedOn && !v.plannedFor) return 'Add a planned date, or the day it was uploaded.'; store.patch('content', id, { platform: v.platform, title: v.title, plannedFor: v.plannedFor || null, uploadedOn: v.uploadedOn || null, link: v.link }); toast('Saved'); },
    onDelete: () => { const old = store.remove('content', id); toast('Deleted', { action: { label: 'Undo', fn: () => store.put('content', old) } }); }, deleteBody: 'It will be removed from your uploads.'
  });
}
export function markUploaded(id) {
  const c = store.get('content', id); if (!c) return;
  store.patch('content', id, { uploadedOn: todayStr() });
  toast(PLATFORMS[c.platform].name + ' · marked uploaded', { icon: 'checkCircle', ms: 5000, action: { label: 'Undo', fn: () => store.patch('content', id, { uploadedOn: null }) } });
}
export function setTargets(st) {
  const c = st.content || {};
  form({
    title: 'Weekly targets', intro: 'Counted Monday to Sunday. Your streak and goal progress follow these.',
    fields: [{ name: 'yt', label: 'YouTube videos a week', type: 'number', min: 0, max: 14, step: 1, half: true, required: true }, { name: 'ig', label: 'Instagram posts a week', type: 'number', min: 0, max: 35, step: 1, half: true, required: true }],
    values: { yt: c.yt != null ? c.yt : 1, ig: c.ig != null ? c.ig : 3 }, submitLabel: 'Save targets',
    onSubmit: (v) => { store.batch(() => { store.setSetting('content.yt', Math.round(v.yt)); store.setSetting('content.ig', Math.round(v.ig)); }); toast('Targets: ' + plural(Math.round(v.yt), 'video') + ' and ' + plural(Math.round(v.ig), 'post') + ' a week'); }
  });
}
