/* ------------------------------------------------------------------
   PLACEHOLDER DATASET  (vertical-slice only)
   ------------------------------------------------------------------
   Real build replaces `frames` with FILM-GRAB image paths, e.g.
     frames: ["images/the-matrix/1.jpg", "images/the-matrix/2.jpg"]
   and the rest of the fields come from the TMDb acquisition step.

   For now `frames` are procedurally-drawn SVG "scenes" so the whole
   game loop (pixel-break, scoring, ladder) is playable offline with
   zero downloads and zero copyrighted material.

   difficulty: easy | medium | hard | veryhard | cinephile
   ------------------------------------------------------------------ */

// tiny helper: returns a standalone SVG string (320x180) the engine
// turns into a data URI and pixelates on a canvas like any image.
function scene(bg, parts) {
  return "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 180'>" +
         "<rect width='320' height='180' fill='" + bg + "'/>" + parts + "</svg>";
}

const MOVIES = [
  // ---------- EASY ----------
  {
    title: "The Matrix", year: 1999, director: "The Wachowskis", country: "USA",
    difficulty: "easy",
    decoys: ["Inception", "Blade Runner", "Total Recall"],
    frames: [
      scene("rgb(8,16,10)",
        "<rect x='40' y='0' width='6' height='180' fill='rgb(40,200,90)'/>" +
        "<rect x='120' y='0' width='6' height='180' fill='rgb(30,150,70)'/>" +
        "<rect x='210' y='0' width='6' height='180' fill='rgb(60,230,110)'/>" +
        "<rect x='280' y='0' width='6' height='180' fill='rgb(25,120,60)'/>" +
        "<circle cx='160' cy='90' r='34' fill='rgb(15,40,20)' stroke='rgb(60,230,110)' stroke-width='3'/>"),
      scene("rgb(10,14,12)",
        "<rect x='0' y='120' width='320' height='60' fill='rgb(20,40,26)'/>" +
        "<rect x='70' y='40' width='30' height='90' fill='rgb(20,30,24)'/>" +
        "<rect x='220' y='40' width='30' height='90' fill='rgb(20,30,24)'/>" +
        "<circle cx='160' cy='70' r='20' fill='rgb(40,180,90)'/>")
    ]
  },
  {
    title: "Titanic", year: 1997, director: "James Cameron", country: "USA",
    difficulty: "easy",
    decoys: ["The Notebook", "Pearl Harbor", "Atonement"],
    frames: [
      scene("rgb(20,30,60)",
        "<rect x='0' y='110' width='320' height='70' fill='rgb(10,20,45)'/>" +
        "<polygon points='40,110 120,70 130,110' fill='rgb(15,15,20)'/>" +
        "<circle cx='250' cy='45' r='26' fill='rgb(240,180,90)'/>"),
      scene("rgb(40,30,55)",
        "<rect x='0' y='120' width='320' height='60' fill='rgb(15,18,40)'/>" +
        "<polygon points='10,120 60,60 90,60 140,120' fill='rgb(20,20,25)'/>" +
        "<rect x='200' y='30' width='80' height='90' fill='rgb(230,140,70)' opacity='0.5'/>")
    ]
  },

  // ---------- MEDIUM ----------
  {
    title: "Amélie", year: 2001, director: "Jean-Pierre Jeunet", country: "France",
    difficulty: "medium",
    decoys: ["Delicatessen", "Le Fabuleux Voyage", "A Very Long Engagement"],
    frames: [
      scene("rgb(40,80,30)",
        "<rect x='0' y='0' width='320' height='180' fill='rgb(60,120,40)'/>" +
        "<rect x='40' y='40' width='90' height='110' fill='rgb(200,40,40)'/>" +
        "<circle cx='220' cy='80' r='40' fill='rgb(230,180,60)'/>"),
      scene("rgb(120,40,40)",
        "<rect x='0' y='100' width='320' height='80' fill='rgb(70,120,50)'/>" +
        "<circle cx='160' cy='70' r='30' fill='rgb(240,200,80)'/>" +
        "<rect x='250' y='20' width='50' height='120' fill='rgb(200,60,50)'/>")
    ]
  },
  {
    title: "No Country for Old Men", year: 2007, director: "Coen Brothers", country: "USA",
    difficulty: "medium",
    decoys: ["There Will Be Blood", "Hell or High Water", "Sicario"],
    frames: [
      scene("rgb(160,130,80)",
        "<rect x='0' y='120' width='320' height='60' fill='rgb(120,95,55)'/>" +
        "<rect x='140' y='40' width='14' height='90' fill='rgb(40,35,30)'/>" +
        "<circle cx='250' cy='40' r='30' fill='rgb(220,190,120)'/>"),
      scene("rgb(60,55,50)",
        "<rect x='0' y='90' width='320' height='90' fill='rgb(40,38,34)'/>" +
        "<rect x='100' y='30' width='120' height='60' fill='rgb(150,120,70)' opacity='0.4'/>" +
        "<circle cx='160' cy='110' r='12' fill='rgb(200,180,150)'/>")
    ]
  },

  // ---------- HARD ----------
  {
    title: "Oldboy", year: 2003, director: "Park Chan-wook", country: "South Korea",
    difficulty: "hard",
    decoys: ["I Saw the Devil", "The Chaser", "Memories of Murder"],
    frames: [
      scene("rgb(90,30,30)",
        "<rect x='0' y='0' width='160' height='180' fill='rgb(40,60,70)'/>" +
        "<rect x='130' y='40' width='60' height='100' fill='rgb(20,25,30)'/>" +
        "<circle cx='160' cy='90' r='18' fill='rgb(200,160,60)'/>"),
      scene("rgb(30,40,45)",
        "<rect x='0' y='110' width='320' height='70' fill='rgb(50,25,25)'/>" +
        "<rect x='60' y='30' width='200' height='14' fill='rgb(150,140,120)'/>" +
        "<circle cx='100' cy='90' r='22' fill='rgb(180,60,50)'/>")
    ]
  },
  {
    title: "In the Mood for Love", year: 2000, director: "Wong Kar-wai", country: "Hong Kong",
    difficulty: "hard",
    decoys: ["Chungking Express", "2046", "Happy Together"],
    frames: [
      scene("rgb(90,40,30)",
        "<rect x='0' y='0' width='320' height='180' fill='rgb(70,30,30)'/>" +
        "<rect x='120' y='20' width='80' height='140' fill='rgb(180,140,50)' opacity='0.5'/>" +
        "<circle cx='160' cy='90' r='24' fill='rgb(200,60,70)'/>"),
      scene("rgb(40,30,40)",
        "<rect x='0' y='120' width='320' height='60' fill='rgb(60,40,35)'/>" +
        "<rect x='40' y='30' width='14' height='100' fill='rgb(220,200,140)'/>" +
        "<rect x='160' y='30' width='120' height='90' fill='rgb(150,60,60)' opacity='0.4'/>")
    ]
  },

  // ---------- VERY HARD ----------
  {
    title: "Stalker", year: 1979, director: "Andrei Tarkovsky", country: "USSR",
    difficulty: "veryhard",
    decoys: ["Solaris", "Mirror", "Andrei Rublev"],
    frames: [
      scene("rgb(70,75,55)",
        "<rect x='0' y='100' width='320' height='80' fill='rgb(45,55,40)'/>" +
        "<rect x='130' y='40' width='8' height='90' fill='rgb(30,30,25)'/>" +
        "<circle cx='220' cy='70' r='16' fill='rgb(120,130,90)'/>"),
      scene("rgb(55,60,50)",
        "<rect x='0' y='0' width='320' height='180' fill='rgb(60,65,52)'/>" +
        "<rect x='40' y='60' width='240' height='8' fill='rgb(90,90,70)'/>" +
        "<circle cx='160' cy='120' r='10' fill='rgb(40,40,35)'/>")
    ]
  },
  {
    title: "The Holy Mountain", year: 1973, director: "Alejandro Jodorowsky", country: "Mexico",
    difficulty: "veryhard",
    decoys: ["El Topo", "The Color of Pomegranates", "Santa Sangre"],
    frames: [
      scene("rgb(180,150,40)",
        "<polygon points='160,30 220,150 100,150' fill='rgb(200,180,60)'/>" +
        "<circle cx='160' cy='70' r='20' fill='rgb(200,40,50)'/>" +
        "<rect x='0' y='150' width='320' height='30' fill='rgb(120,90,30)'/>"),
      scene("rgb(40,30,60)",
        "<circle cx='160' cy='90' r='50' fill='rgb(220,180,50)'/>" +
        "<rect x='150' y='20' width='20' height='140' fill='rgb(180,40,40)'/>" +
        "<circle cx='160' cy='90' r='14' fill='rgb(40,30,60)'/>")
    ]
  },

  // ---------- CINEPHILE ----------
  {
    title: "Sátántangó", year: 1994, director: "Béla Tarr", country: "Hungary",
    difficulty: "cinephile",
    decoys: ["Werckmeister Harmonies", "The Turin Horse", "Damnation"],
    frames: [
      scene("rgb(35,35,35)",
        "<rect x='0' y='110' width='320' height='70' fill='rgb(20,20,20)'/>" +
        "<rect x='150' y='30' width='6' height='90' fill='rgb(70,70,70)'/>" +
        "<circle cx='90' cy='70' r='10' fill='rgb(110,110,110)'/>"),
      scene("rgb(45,45,45)",
        "<rect x='0' y='0' width='320' height='180' fill='rgb(40,40,40)'/>" +
        "<rect x='30' y='40' width='260' height='4' fill='rgb(75,75,75)'/>" +
        "<rect x='30' y='100' width='260' height='4' fill='rgb(60,60,60)'/>")
    ]
  },
  {
    title: "Tropical Malady", year: 2004, director: "Apichatpong Weerasethakul", country: "Thailand",
    difficulty: "cinephile",
    decoys: ["Uncle Boonmee", "Cemetery of Splendour", "Blissfully Yours"],
    frames: [
      scene("rgb(15,30,18)",
        "<rect x='0' y='0' width='320' height='180' fill='rgb(18,35,20)'/>" +
        "<rect x='60' y='20' width='10' height='140' fill='rgb(30,55,30)'/>" +
        "<rect x='180' y='10' width='14' height='150' fill='rgb(25,45,25)'/>" +
        "<circle cx='160' cy='120' r='8' fill='rgb(120,140,90)'/>"),
      scene("rgb(10,18,12)",
        "<rect x='0' y='130' width='320' height='50' fill='rgb(8,14,9)'/>" +
        "<circle cx='160' cy='80' r='6' fill='rgb(200,200,160)'/>" +
        "<rect x='100' y='30' width='120' height='80' fill='rgb(20,40,24)' opacity='0.5'/>")
    ]
  }
];
