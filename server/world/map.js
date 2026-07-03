export const walls = [
    // Gornji levi blok
    { x: 180, y: 120, w: 120, h: 20 },
    { x: 180, y: 120, w: 20,  h: 100 },
    { x: 280, y: 120, w: 20,  h: 100 },

    // Gornji desni blok
    { x: 1100, y: 100, w: 20,  h: 160 },
    { x: 1100, y: 100, w: 160, h: 20  },
    { x: 1260, y: 100, w: 20,  h: 160 },

    // Centralni lavirint
    { x: 650, y: 200, w: 20,  h: 200 },
    { x: 650, y: 200, w: 200, h: 20  },
    { x: 850, y: 200, w: 20,  h: 120 },
    { x: 650, y: 400, w: 140, h: 20  },

    // Levi hodnik
    { x: 300, y: 400, w: 200, h: 20 },
    { x: 300, y: 420, w: 20,  h: 120 },

    // Desni hodnik
    { x: 1100, y: 420, w: 20,  h: 120 },
    { x: 1000, y: 540, w: 120, h: 20  },

    // Donji levi blok
    { x: 200, y: 680, w: 160, h: 20  },
    { x: 200, y: 680, w: 20,  h: 120 },
    { x: 360, y: 680, w: 20,  h: 120 },
    { x: 200, y: 800, w: 180, h: 20  },

    // Donji desni blok
    { x: 1200, y: 700, w: 20,  h: 160 },
    { x: 1200, y: 700, w: 160, h: 20  },
    { x: 1360, y: 700, w: 20,  h: 160 },
    { x: 1200, y: 860, w: 180, h: 20  },

    // Srednji donji zid
    { x: 680, y: 700, w: 240, h: 20 },
    { x: 680, y: 720, w: 20,  h: 80 },
    { x: 900, y: 720, w: 20,  h: 80 },

    // Gornji srednji zid
    { x: 600, y: 60, w: 160, h: 20 },

    // Ostali zidovi
    { x: 460,  y: 560, w: 20,  h: 100 },
    { x: 1080, y: 300, w: 100, h: 20  },
];

export const SPAWN_POINTS = [
    { x: 60,   y: 60  },
    { x: 1520, y: 60  },
    { x: 60,   y: 920 },
    { x: 1520, y: 920 }
];