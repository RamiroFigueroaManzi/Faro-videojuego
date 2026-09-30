# FARO · Respuesta

Minijuego web de 30 segundos: llevá el camión de bomberos desde la central de FARO hasta el incendio, cargá agua, rescatá civiles y apagá el fuego con una secuencia de botones. Se juega con **joystick de PS4** (DualShock 4) o con teclado.

Estética tomada de la identidad de FARO (paleta nocturna + acento ember, Oswald / JetBrains Mono / Monoton), con atmósfera de niebla, rayos de luz y motas flotantes.

## Cómo jugar

1. **Cargá agua** — frená dentro del círculo azul de un hidrante y **machacá ✕** hasta llenar el tanque. Sin agua no podés atacar el fuego.
2. **Rescatá civiles** — pasá por encima de las figuras de máscara blanca: **+2 s** cada uno.
3. **Esquivá** escombros, autos incendiados y tránsito (cada choque: **−1 s**). Los conos se pueden atropellar y las manchas de aceite te hacen patinar.
4. **Apagá el incendio** — al llegar, seguí la **secuencia de 6 botones** (✕ ○ □ △). Cada error: −1 s.

El puntaje depende del tiempo que te sobra, los civiles rescatados, los choques y si hiciste la secuencia sin errores. Rangos: **S / A / B / C** (F si no llegás). El récord se guarda en el navegador.

## Controles

| Acción | PS4 | Teclado |
|---|---|---|
| Dirigir y acelerar | Stick izquierdo (el camión va hacia donde apuntás) | Flechas / WASD |
| Acelerar / frenar | R2 / L2 (o D-pad) | ↑ / ↓ |
| Cargar agua / confirmar | ✕ | Espacio o K |
| Secuencia ✕ ○ □ △ | ✕ ○ □ △ | K L J I |
| Pausa | Options | Esc |
| Silenciar | — | M |

> El joystick se detecta con la Gamepad API: conectalo por USB o Bluetooth y **tocá cualquier botón** con la página abierta. Funciona en Chrome, Edge y Firefox. Los navegadores solo habilitan el sonido después de un clic o una tecla.

## Correr localmente

No tiene dependencias ni build: abrí `index.html` con doble clic, o levantá un servidor estático:

```bash
npx serve .
```

## Publicar en GitHub Pages

En *Settings → Pages* del repo, elegí **Deploy from a branch → `main` / root**. Queda en
`https://ramirofigueroamanzi.github.io/Faro-videojuego/`.

## Estructura

```
index.html        HUD y pantallas (título, despacho, resultado, pausa)
css/style.css     Tokens de color y tipografías de FARO, vidrio esmerilado
js/util.js        Helpers, paleta y glifos de botones PS4
js/input.js       Gamepad API + teclado + vibración
js/audio.js       Sirena, motor y efectos sintetizados con WebAudio
js/world.js       Generación procedural de la ciudad y colisiones
js/render.js      Canvas: capa de luz, fuego, niebla, partículas, radar
js/game.js        Estados, física del camión, tareas y puntaje
```

Para probar escenas sueltas: `index.html?debug=play`, `?debug=hydrant`, `?debug=qte`, `?debug=lose`.
