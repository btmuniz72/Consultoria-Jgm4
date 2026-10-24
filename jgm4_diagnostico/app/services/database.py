from pathlib import Path
from app.models.database import Base, Parameter, make_engine

DEFAULTS = {'home_rate':'120', 'external_rate':'220', 'daily_rate':'0', 'km_rate':'0', 'lodging':'0', 'food':'0', 'contingency':'0', 'discount':'0', 'max_discount':'0', 'minimum_margin':'0', 'taxes':'0', 'proposal_validity_days':'15', 'currency':'BRL'}

def init_db(base_dir: Path):
    engine = make_engine(base_dir); Base.metadata.create_all(engine)
    with engine.begin() as connection:
        columns = {row[1] for row in connection.exec_driver_sql('PRAGMA table_info(pricing_stages)').fetchall()}
        if 'selected' not in columns:
            connection.exec_driver_sql('ALTER TABLE pricing_stages ADD COLUMN selected BOOLEAN NOT NULL DEFAULT 1')
            connection.exec_driver_sql('UPDATE pricing_stages SET selected = CASE WHEN optional = 1 THEN 0 ELSE 1 END')
    from sqlalchemy.orm import Session
    with Session(engine) as session:
        for key, value in DEFAULTS.items():
            if session.get(Parameter, key) is None: session.add(Parameter(key=key, value=value))
        session.commit()
