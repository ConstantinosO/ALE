import { parseRoute } from './router.js';

const container = document.getElementById('view');

async function render() {
  const route = parseRoute(location.hash);
  container.innerHTML = `<p class="muted">Προβολή: ${route.view}</p>`;
}

window.addEventListener('hashchange', render);
render();
