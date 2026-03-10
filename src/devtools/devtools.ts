// Register the DevTools panel from an external script because DevTools pages
// run under a CSP that blocks inline JavaScript.
chrome.devtools.panels.create('Mock Keyboard', '', 'src/devtools/panel.html');
