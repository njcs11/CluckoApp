import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from db import get_db

FARM_SYNC_DATA = [
    ('ORENCE GAMEFOWL FARM', 7.15617042787629, 125.656337667658, 'Panacan, Bunawan District'),
    ('PRIME GAMEFARM', 7.01711027130965, 125.499653419066, 'Eden, Toril District'),
    ('BBC GAME FOWL FARM', 7.0316344189761, 125.477596839402, 'Toril, Davao City'),
    ('RBC GAMEFOWL FARM', 7.18865171460957, 125.455623636469, 'Calinan Poblacion, Calinan District'),
    ("Jaspher's Farm", 7.12906688251619, 125.58841194773, 'Tigatto, Buhangin District'),
    ('LUMIERE GAMEFOWL', 7.10806387893348, 125.61360343715, 'Lanang, Buhangin District'),
    ('Blackie Farm', 7.1950, 125.4150, 'Malagos, Baguio District'),
    ("Nicole's Farm", 7.1820, 125.3580, 'Baguio (Malagos), Davao City'),
    ('Ash Farm', 7.0910, 125.5030, 'Mintal, Tugbok District'),
    ('NOKNOK GAME FARM', 7.1250, 125.6100, 'Buhangin, Davao City'),
    ("Qwe's Farm", 7.0700, 125.5500, 'Talomo, Davao City'),
    ("Yqy's Farm", 7.0800, 125.5900, 'Poblacion, Davao City'),
]

def sync_farms():
    db = get_db()
    try:
        with db.cursor() as cur:
            for name, lat, lng, loc in FARM_SYNC_DATA:
                cur.execute('''
                    UPDATE farms 
                    SET farm_location = %s, latitude = %s, longitude = %s
                    WHERE LOWER(farm_name) = LOWER(%s)
                ''', (loc, lat, lng, name))
                print(f'Updated farm: {name} -> {loc} ({lat}, {lng})')

                cur.execute('''
                    UPDATE users
                    SET farm_location = %s
                    WHERE id IN (SELECT owner_id FROM farms WHERE LOWER(farm_name) = LOWER(%s))
                ''', (loc, name))
            db.commit()
            print('Successfully committed all farm location updates!')
    finally:
        db.close()

if __name__ == '__main__':
    sync_farms()

