// THRESHOLD: entry point.
import { App } from './game/app.js';

const params = new URLSearchParams(location.search);
const app = new App(document.getElementById('view'), document.getElementById('ui'), params);
if (params.has('play')) app.start(false);
else if (params.has('demo')) app.start(true);
else app.hud.showTitle(true);
app.loop();
