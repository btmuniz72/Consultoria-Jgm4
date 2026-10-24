from pathlib import Path
from nicegui import app, ui
from app.services.database import init_db
from app.ui.shell import render_shell

BASE_DIR = Path(__file__).resolve().parent
init_db(BASE_DIR)
app.add_static_files('/assets', BASE_DIR / 'assets')
render_shell(BASE_DIR)
ui.run(title='JGM4 Diagnóstico Logístico', host='127.0.0.1', port=8080, reload=False, show=True)
