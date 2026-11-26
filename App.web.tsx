// The web build's root (Metro picks App.web.tsx over App.tsx for the web).
// The website is its own small app (src/web/SiteApp.tsx); the phone app's
// navigation, contexts and native-only modules never reach the browser.
export { default } from './src/web/SiteApp';
