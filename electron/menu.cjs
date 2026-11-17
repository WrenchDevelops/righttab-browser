const { Menu } = require('electron');

function installMenu(actions) {
  function rebuild() {
    const settings = actions.settings();
    const template = [
      {
        label: 'RightTab',
        submenu: [
          { label: 'About RightTab', click: () => actions.command('open-shortcuts') },
          { type: 'separator' },
          { label: 'Settings…', accelerator: 'CommandOrControl+,', click: () => actions.command('open-settings') },
          { label: 'Extensions…', click: () => actions.command('open-extensions') },
          { label: 'Appearance…', click: () => actions.command('open-appearance') },
          { label: 'Import browser data…', click: () => actions.command('open-import') },
          { type: 'separator' },
          ...(process.platform === 'darwin' ? [
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          ] : []),
          { role: 'quit' },
        ],
      },
      {
        label: 'File',
        submenu: [
          { label: 'New Tab', accelerator: 'CommandOrControl+T', click: () => actions.newTab() },
          { label: 'New Window', accelerator: 'CommandOrControl+N', click: () => actions.newWindow() },
          { label: 'New Private Window', accelerator: 'Shift+CommandOrControl+N', click: () => actions.newPrivateWindow() },
          { type: 'separator' },
          { label: 'Open Location…', accelerator: 'CommandOrControl+L', click: () => actions.command('focus-omnibox') },
          { label: 'Close Tab', accelerator: 'CommandOrControl+W', click: () => actions.closeTab() },
          { label: 'Close Window', accelerator: 'Shift+CommandOrControl+W', click: () => actions.closeWindow() },
          { label: 'Reopen Closed Tab', accelerator: 'Shift+CommandOrControl+T', click: () => actions.reopenTab() },
        ],
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'pasteAndMatchStyle' },
          { role: 'delete' },
          { role: 'selectAll' },
          { type: 'separator' },
          { label: 'Find…', accelerator: 'CommandOrControl+F', click: () => actions.command('open-find') },
          { label: 'Find Next', accelerator: 'CommandOrControl+G', click: () => actions.findNext() },
          { label: 'Find Previous', accelerator: 'Shift+CommandOrControl+G', click: () => actions.findPrevious() },
        ],
      },
      {
        label: 'View',
        submenu: [
          { label: 'Reload', accelerator: 'CommandOrControl+R', click: () => actions.reload(false) },
          { label: 'Hard Reload', accelerator: 'Shift+CommandOrControl+R', click: () => actions.reload(true) },
          { type: 'separator' },
          { label: 'Actual Size', accelerator: 'CommandOrControl+0', click: () => actions.zoom('reset') },
          { label: 'Zoom In', accelerator: 'CommandOrControl+Plus', click: () => actions.zoom('in') },
          { label: 'Zoom In', accelerator: 'CommandOrControl+=', visible: false, click: () => actions.zoom('in') },
          { label: 'Zoom Out', accelerator: 'CommandOrControl+-', click: () => actions.zoom('out') },
          { type: 'separator' },
          { label: 'Toggle Tab Sidebar', accelerator: 'Alt+CommandOrControl+S', click: () => actions.toggleSidebar() },
          {
            label: 'Show Bookmark Bar',
            type: 'checkbox',
            checked: settings.showBookmarkBar !== false,
            accelerator: 'Shift+CommandOrControl+B',
            click: () => actions.toggleBookmarkBar(),
          },
          { type: 'separator' },
          { label: 'Developer Tools', accelerator: 'Alt+CommandOrControl+I', click: () => actions.devTools() },
          { role: 'togglefullscreen' },
        ],
      },
      {
        label: 'History',
        submenu: [
          { label: 'Back', accelerator: 'CommandOrControl+[', click: () => actions.back() },
          { label: 'Forward', accelerator: 'CommandOrControl+]', click: () => actions.forward() },
          { label: 'Home', accelerator: 'Shift+CommandOrControl+H', click: () => actions.home() },
          { type: 'separator' },
          { label: 'Show History', accelerator: 'CommandOrControl+Y', click: () => actions.command('open-history') },
        ],
      },
      {
        label: 'Bookmarks',
        submenu: [
          { label: 'Bookmark This Page', accelerator: 'CommandOrControl+D', click: () => actions.bookmark() },
          { label: 'Manage Bookmarks', accelerator: 'Alt+CommandOrControl+B', click: () => actions.command('open-bookmarks') },
        ],
      },
      {
        label: 'Window',
        submenu: [
          { label: 'Downloads', accelerator: 'Shift+CommandOrControl+J', click: () => actions.command('toggle-downloads') },
          { label: 'Passwords', accelerator: 'Shift+CommandOrControl+P', click: () => actions.command('open-passwords') },
          { label: 'Saved Password Suggestions', accelerator: 'Shift+CommandOrControl+L', click: () => actions.command('password-suggestions') },
          { type: 'separator' },
          { role: 'minimize' },
          { role: 'zoom' },
          { type: 'separator' },
          ...(process.platform === 'darwin' ? [{ role: 'front' }] : []),
          { type: 'separator' },
          ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((number) => ({
            label: `Select Tab ${number}`,
            accelerator: `CommandOrControl+${number}`,
            visible: false,
            click: () => actions.selectTabIndex(number - 1),
          })),
        ],
      },
      {
        label: 'Help',
        submenu: [
          { label: 'Start Playback Diagnostics', click: () => actions.startMediaDiagnostics() },
          { label: 'Save Playback Diagnostics…', click: () => actions.saveMediaDiagnostics() },
          { type: 'separator' },
          { label: 'Keyboard Shortcuts', click: () => actions.command('open-shortcuts') },
          { label: 'Import browser data…', click: () => actions.command('open-import') },
        ],
      },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  }

  rebuild();
  return { rebuild };
}

module.exports = { installMenu };
