# FARO · Respuesta

Minijuego web de 30 segundos: llevá el camión de bomberos desde la central de FARO hasta el incendio antes de que se propague. Se juega con **joystick de PS4** (DualShock 4) o con teclado y mouse, y está pensado para un stand: partidas cortas, un único mapa fijo, ranking con iniciales sin límite de participantes y fantasma del mejor recorrido.

Estética tomada de la identidad de FARO (paleta nocturna + acento ember, Oswald / JetBrains Mono / Monoton), con atmósfera de niebla, rayos de luz y motas flotantes. La música es atmosférica, estilo Hollow Knight (piano, cuerdas, violonchelo y timbal con reverb, en Re menor), sintetizada en vivo; su pulso se acelera cuando queda poco tiempo o durante el ataque final.

## Cómo jugar

1. **Cargá agua**: frená en el círculo azul de un hidrante y apretá ✕ cuando la aguja pase por la **zona verde** (en el centro dorado es **PERFECTO**). Sin agua no podés atacar el fuego.
2. **Pasá rozando** autos, escombros y autos incendiados a alta velocidad: sumás **combo** y cargás el **turbo** (R1). Chocar resta 1 s y corta el combo.
3. **Rescatá civiles**: +2 s cada uno.
4. **Reaccioná a los eventos del camino**:
   - Autos incendiados con ⚠ que **explotan** cuando te acercás: pasá rápido y zafás (suma combo); si te agarra cerca, te empuja y resta 1 s.
   - **Derrumbes** que cortan una calle cuando llegás cerca: buscá otro camino.
   - A los 5 s, un **civil atrapado** pide ayuda: si llegás antes de que se termine su cuenta regresiva, **+3 s** y bonus.
5. **El fuego se propaga** a un edificio vecino a los 10 s y a otro a los 18 s: más focos y una secuencia más larga.
6. **Atacá el incendio**: primero armá la línea con la secuencia de botones (✕ ○ □ △) y después **apuntá la manguera** con el stick derecho y tirá agua con R2 hasta apagar todos los focos.
7. **Anotate en el ranking** con tus 3 iniciales: entran todos los que juegan y ves tu puesto sobre el total. Tu mejor recorrido queda como **fantasma** para los próximos jugadores.

El puntaje suma el tiempo restante, los civiles, los combos, los PERFECTO, los focos apagados y cuánto contuviste la propagación. Rangos: **S / A / B / C** (F si no llegás). Si nadie toca nada en la pantalla de resultado, el juego vuelve solo al título.

## Controles

| Acción | PS4 | Teclado / mouse |
|---|---|---|
| Dirigir y acelerar | Stick izquierdo (el camión va hacia donde apuntás) | WASD / flechas |
| Acelerar / frenar | R2 / L2 (o D-pad) | ↑ / ↓ |
| Turbo | R1 | Shift |
| Hidrante / confirmar | ✕ | Espacio o K |
| Secuencia ✕ ○ □ △ | ✕ ○ □ △ | K L J I |
| Apuntar la manguera | Stick derecho | Mouse o flechas |
| Tirar agua | R2 o ✕ | Clic o Espacio |
| Iniciales | ▲ ▼ letra · ◂ ▸ mover (stick o D-pad) | Escribir letras · Enter |
| Pausa | Options | Esc |
| Silenciar | — | M |

> El joystick se detecta con la Gamepad API: conectalo por USB o Bluetooth y **tocá cualquier botón** con la página abierta. Funciona en Chrome, Edge y Firefox. El navegador solo habilita el sonido después de un clic o una tecla.

Los récords y fantasmas se guardan en el navegador de la compu (localStorage). Para resetear el ranking del stand: DevTools → Application → Local Storage → borrar las claves `faro-*`.

## Para el stand: `jugar-stand.bat`

Hacé doble clic en **`jugar-stand.bat`**. Abre el juego en Chrome (o Edge) en pantalla completa y con el **sonido habilitado desde el arranque**, sin necesidad de clic: los navegadores bloquean el audio hasta un clic o una tecla, y los botones del joystick no cuentan. Usa un perfil de navegador aparte, así no interfiere con tu Chrome abierto. Para salir: **Alt + F4**.

Si abrís `index.html` directo, el sonido se activa con el primer clic o tecla.

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
index.html        HUD y pantallas (título, despacho, resultado con ranking, pausa)
css/style.css     Tokens de color y tipografías de FARO, vidrio esmerilado
js/util.js        Helpers, generador con semilla, paleta y glifos PS4
js/input.js       Gamepad API + teclado/mouse, navegación de menús, vibración
js/audio.js       Música, sirena, motor y efectos sintetizados con WebAudio
js/world.js       Mapa fijo, generación de la ciudad, focos de incendio y colisiones
js/render.js      Canvas: capa de luz, fuego, niebla, fantasma, mira, radar
js/game.js        Estados, física, combos, hidrante, ataque, récords
```

Para probar escenas sueltas: `index.html?debug=play`, `?debug=hydrant`, `?debug=attack`, `?debug=aim`, `?debug=lose`, `?debug=win`, `?debug=derrumbe`, `?debug=explosion`, `?debug=atrapado`.
