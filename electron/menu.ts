import {app, Menu, shell} from 'electron';
import type {MenuItemConstructorOptions} from 'electron';
import {messages} from '../shared/i18n';
import type {TLocale, TMenuAction} from '../shared/types';

const WEBSITE_URL = 'https://evb-player.vercel.app';

export function setApplicationMenu(locale: TLocale, sendAction: (action: TMenuAction) => void) {
  const text = messages[locale].menu;
  const isMac = process.platform === 'darwin';
  const template: MenuItemConstructorOptions[] = [];

  if (isMac) {
    template.push({
      label: text.appName,
      submenu: [
        {label: text.about, role: 'about'},
        {type: 'separator'},
        {label: text.services, role: 'services'},
        {type: 'separator'},
        {label: text.hideApp, role: 'hide'},
        {label: text.hideOthers, role: 'hideOthers'},
        {label: text.showAll, role: 'unhide'},
        {type: 'separator'},
        {label: text.quitApp, role: 'quit'},
      ],
    });
  }

  template.push(
    {
      label: text.file,
      submenu: [
        {label: text.addFolder, accelerator: 'CmdOrCtrl+O', click: () => sendAction('add-folder')},
        {type: 'separator'},
        isMac
          ? {label: text.closeWindow, role: 'close'}
          : {label: text.quit, role: 'quit', accelerator: 'Ctrl+Q'},
      ],
    },
    {
      label: text.edit,
      submenu: [
        {label: text.undo, role: 'undo'},
        {label: text.redo, role: 'redo'},
        {type: 'separator'},
        {label: text.cut, role: 'cut'},
        {label: text.copy, role: 'copy'},
        {label: text.paste, role: 'paste'},
        {label: text.selectAll, role: 'selectAll'},
      ],
    },
    {
      label: text.view,
      submenu: [{label: text.toggleFullScreen, role: 'togglefullscreen'}],
    },
  );

  if (isMac) {
    template.push({
      label: text.window,
      submenu: [
        {label: text.minimize, role: 'minimize'},
        {label: text.zoom, role: 'zoom'},
        {type: 'separator'},
        {label: text.bringAllToFront, role: 'front'},
      ],
    });
  }

  template.push({
    label: text.help,
    submenu: [
      {label: text.checkForUpdates, click: () => sendAction('check-for-updates')},
      {type: 'separator'},
      {
        label: text.about,
        ...(isMac ? {role: 'about' as const} : {click: () => app.showAboutPanel()}),
      },
      {type: 'separator'},
      {label: text.website, click: () => void shell.openExternal(WEBSITE_URL)},
      {label: text.keyboardShortcuts, click: () => sendAction('keyboard-shortcuts')},
    ],
  });

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
