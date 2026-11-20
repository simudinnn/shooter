# Uređivač sadržaja

Na Windowsu dvoklikni **Open Content Editor.bat**. Ako već imaš pokrenutu igru lokalno, na istoj adresi otvori `/tools/content-editor.html`. Primjer je `http://localhost:3000/tools/content-editor.html`.

1. Dodaj PNG datoteke pod `assets/`. U obrascu koristi putanje od korijena projekta, npr. `assets/enemies/my_robot.png`.
2. Odaberi kategoriju, upiši jedinstveni ID i spremi zapis u radnu verziju. Za izmjene odaberi već postojeći zapis.
3. Za predmet ili pušku napravi i loot zapis. Kao cilj upiši njihov ID. Viša težina znači veću šansu da se pojave u škrinji.
4. Izvezi katalog. Zamijeni `js/custom-content-data.js` preuzetom datotekom i osvježi igru.

Neprijatelji koriste napad izbliza. Pasivni NPC koristi istu fiziku i animaciju kretanja, bez napada. Za hodanje koristi niz kvadratnih kadrova u jednoj vodoravnoj ili okomitoj traci. Mirovanje i tijelo koriste po jedan kadar iste veličine. Težina pojavljivanja 0 isključuje prirodno pojavljivanje.

Predmeti se slažu kao materijali. Oružja koriste postojeće vrste streljiva i standardno punjenje spremnika. Loot zapisi dodaju sadržaj postojećim škrinjama. Katalog dodaje i uređuje vlastite zapise, dok osnovni sadržaj ostaje definiran u igri.

Zadrži ID-eve objavljenih zapisa jer se koriste u spremljenim igrama. Uvezeni katalog zamjenjuje radnu verziju u editoru. Izvoz ne upisuje datoteke izravno u projekt.
