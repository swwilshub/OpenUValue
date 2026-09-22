import {
  CavityFigure,
  CombinedFigure,
  DirectionFigure,
  DewPointFigure,
  DragFigure,
  EnvironmentFigure,
  FilmsFigure,
  GaugeFigure,
  GlaserFigure,
  KappaFigure,
  LayersFigure,
  MonthsFigure,
  PickerFigure,
  ProvenanceFigure,
  ResistanceFigure,
  SeasonFigure,
  ShareFigure,
  StudFigure,
  SurfaceConditionFigure,
  TemperatureFigure,
  VapourFigure,
  WaveFigure,
} from './figures.js';

/**
 * Every control and every box in OpenUValue, with a diagram of what it does.
 *
 * The ordering follows the screen rather than the physics: someone looking something up
 * is looking at a thing and wants to know what it is. The physics tour ("How to read
 * this drawing") is the other way round and still exists for a first read.
 *
 * Each topic has an `id`, which is what a help button next to a box passes in to open
 * the guide at the right place. Those ids are referenced from the panels, so renaming one
 * breaks a button — grep before changing it.
 */

export interface GuideTopic {
  readonly id: string;
  readonly title: string;
  readonly figure: JSX.Element;
  readonly body: JSX.Element;
}

export interface GuideChapter {
  readonly id: string;
  readonly title: string;
  readonly blurb: string;
  readonly topics: readonly GuideTopic[];
}

export const CHAPTERS: readonly GuideChapter[] = [
  /*
   * Task-shaped walkthroughs first, because the guide opens at the beginning from the
   * header, and someone arriving there usually has a job in mind rather than a box they
   * want explained. Each step names the control it uses by the words on screen, so the
   * reference chapters that follow can be found from it.
   */
  {
    id: 'walkthroughs',
    title: 'Walkthroughs',
    blurb: 'Step-by-step routes through the tool for the questions people most often bring to it.',
    topics: [
      {
        id: 'walk-own-buildup',
        title: 'Model your own wall, roof or floor',
        figure: <LayersFigure />,
        body: (
          <>
            <p>
              The quickest way to a build-up of your own is to start from one that is nearly
              right and change it, rather than from an empty list.
            </p>
            <ol>
              <li>
                <strong>Start from the nearest example.</strong> The header has a masonry
                cavity wall, a timber frame wall and a cold roof. Picking one replaces what is
                on screen.
              </li>
              <li>
                <strong>Say what you are building.</strong> In the Conditions box, choose wall,
                roof or ceiling, or floor, and give a roof its pitch. Then choose what is on
                the other side: open air, a loft, a garage, another heated room.
              </li>
              <li>
                <strong>Make the layers match, inside to outside.</strong> Change a
                layer&rsquo;s material in its picker and type its thickness. Delete anything
                you do not have, and add what is missing from the materials tray under the
                drawing, either by dragging a chip to where the layer goes or by clicking it.
              </li>
              <li>
                <strong>Add the timbers.</strong> If insulation sits between studs, joists or
                rafters, press <em>+ studs or rafters</em> on that layer and give the timber
                width and spacing. Leaving them out can make the U-value look a fifth better
                than it is.
              </li>
              <li>
                <strong>Read the strip under the drawing.</strong> Set <em>Judge the U-value
                as</em> to match your job, then check the U-value against its limit, the
                inside surface for mould, and the condensation figure.
              </li>
              <li>
                <strong>Check the Result box.</strong> Read anything under Notes and limits,
                and if screws, ties or brackets pass through the insulation, enter a fastener
                correction.
              </li>
              <li>
                <strong>Keep it.</strong> <em>Copy share link</em> saves the whole build-up in
                the link, so bookmark it or send it on.
              </li>
            </ol>
          </>
        ),
      },
      {
        id: 'walk-internal-insulation',
        title: 'Will insulating on the inside cause damp?',
        figure: <DragFigure />,
        body: (
          <>
            <p>
              Internal insulation makes the wall behind it colder, and a colder wall is where
              moisture from the room ends up. This is the check to make before lining a solid
              wall.
            </p>
            <ol>
              <li>
                <strong>Build the wall as it stands today</strong>, without the new
                insulation: for a solid wall, usually plaster on brick. Note the U-value.
              </li>
              <li>
                <strong>Set the inside humidity honestly.</strong> A bedroom or kitchen is
                damper than a living room, and the result depends on it.
              </li>
              <li>
                <strong>Add the lining on the room side.</strong> Drag insulation and a board
                from the materials tray into the gap next to the room. The U-value improves.
              </li>
              <li>
                <strong>Look for drops on the drawing</strong> and the Condensation figure in
                the strip. A drop marks a plane where water forms; the notes under the
                drawing say how much, and whether it clears again.
              </li>
              <li>
                <strong>Open the Moisture tab</strong> to see where it condenses and whether
                it dries out over a drying season you set.
              </li>
              <li>
                <strong>Try the two fixes.</strong> Add a <em>Vapour control layer</em> from
                the Membrane group on the warm side of the insulation and watch the
                condensation fall while the U-value stays put. Then drag the insulation to
                the outside instead and compare.
              </li>
            </ol>
            <p>
              <strong>Know what this cannot see.</strong> The moisture calculation moves
              vapour by diffusion only. A solid wall also takes in rain, and the tool does
              not model that, so on an exposed wall a clear result here is necessary but not
              the whole answer. The Location box says how much rain your wall is likely to
              catch.
            </p>
          </>
        ),
      },
      {
        id: 'walk-loft',
        title: 'Topping up loft insulation, and the payback',
        figure: <GaugeFigure value={0.2} limit={0.16} />,
        body: (
          <>
            <ol>
              <li>
                <strong>Load the cold roof example.</strong> It is a ceiling under a
                ventilated loft: quilt between the joists and a second layer laid across
                them.
              </li>
              <li>
                <strong>Add the top-up.</strong> Select the top layer of quilt, then click the{' '}
                <em>Mineral wool</em> chip in the tray: the new layer lands after the selected
                one, on the loft side. Set its thickness.
              </li>
              <li>
                <strong>Judge it as a renovated element</strong> in the strip, since you are
                improving an existing roof rather than building a new one.
              </li>
              <li>
                <strong>Open the Retrofit tab and tick the layer you added.</strong> What is
                left is the loft as it was, so the tool compares the two.
              </li>
              <li>
                <strong>Enter the area and the price.</strong> Quilt comes in rolls rather than
                boards, so type the roll&rsquo;s width and length in place of a sheet size and
                its price as the price of one sheet. Add labour if someone else is laying it.
              </li>
              <li>
                <strong>Read the payback</strong>, then the note beneath it on why the real
                one is usually longer.
              </li>
            </ol>
            <p>
              Adding insulation above the joists makes the loft itself colder, so it is worth
              keeping its ventilation clear. That is outside what this tool calculates.
            </p>
          </>
        ),
      },
      {
        id: 'walk-summer',
        title: 'Comparing two build-ups for summer heat',
        figure: <WaveFigure />,
        body: (
          <>
            <p>
              Two build-ups with the same U-value can behave very differently on a hot day.
              The summer figures show how.
            </p>
            <ol>
              <li>
                <strong>Load the first build-up</strong> and note the decrement, the time
                shift and κ<sub>i</sub> at the end of the strip. Copy its share link.
              </li>
              <li>
                <strong>Load or build the second</strong> and compare. Open the first link in
                another tab to see both at once.
              </li>
              <li>
                <strong>Read them together.</strong> A lower decrement lets less of the
                outdoor swing through; a longer time shift moves the peak later into the
                evening; a higher κ<sub>i</sub> means more heat the room side can soak up in
                the day and give back at night.
              </li>
              <li>
                <strong>Try moving the mass.</strong> Drag a heavy layer to the room side of
                the insulation and κ<sub>i</sub> rises. Put the insulation on the inside and
                it falls, however heavy the wall behind is.
              </li>
            </ol>
            <p>
              These are properties of the element, not an overheating verdict. Whether a room
              overheats also depends on its windows, shading, ventilation and use, which this
              tool does not model.
            </p>
          </>
        ),
      },
    ],
  },

  {
    id: 'drawing',
    title: 'The drawing',
    blurb: 'The cross-section at the top of the page, and everything drawn on it.',
    topics: [
      {
        id: 'layers-to-scale',
        title: 'Layers, drawn to scale',
        figure: <LayersFigure />,
        body: (
          <>
            <p>
              The build-up runs <strong>inside on the left, outside on the right</strong>, and
              each layer is drawn at its real thickness. Widen a layer in the list and it widens
              here. A roof or a floor is drawn down the page instead, outside at the top for a
              roof and the room at the top for a floor, so the drawing sits the way the element
              does and the layer names move to the side.
            </p>
            <p>
              The hatching says what a layer is made of, following ordinary drawing
              conventions: running-bond coursing for masonry, aggregate among a stipple for
              concrete, grain for timber, a soft quilt wave for insulation, a fine stipple for
              plaster, lapped arcs for a tile covering. The same hatch appears beside the
              material in the picker, so the list and the drawing read as one thing. Each layer
              is also shaded darker towards its two faces, which is a drawing device rather than
              information: it separates one slab from the next without a line that could be
              mistaken for a material boundary.
            </p>
            <p>
              Names sit <strong>outside</strong> the drawing with a numbered leader to the layer
              each belongs to, rather than inside it. A name set inside a layer has to be
              rotated, gets cut short by anything narrow, and competes with the
              temperature line for the same space. The number on the leader is the layer's
              place in the build-up, the same one the layer list and the 3D view use.
            </p>
            <p>
              Under the drawing the overall thickness is dimensioned end to end, and under that
              is a <strong>scale bar</strong> of a round number of millimetres. The bar is worth
              a glance before reading anything off the drawing: it takes the longest round length
              that fits, so it also says how hard the build-up has been squeezed to fit the
              width.
            </p>
          </>
        ),
      },
      {
        id: 'surface-films',
        title: 'The two hatched strips at the edges',
        figure: <FilmsFigure />,
        body: (
          <>
            <p>
              Those are the <strong>surface resistances</strong>, the thin films of still air
              that cling to each face of a wall. They are real resistance: the inside film is
              worth about as much as 5 mm of insulation, and the calculation would be wrong
              without them.
            </p>
            <p>
              They have no thickness to draw, so they are shown at a fixed width. R
              <sub>si</sub> is the inside one, R<sub>se</sub> the outside; both come from
              BS EN ISO 6946 and depend on which way heat is flowing.
            </p>
          </>
        ),
      },
      {
        id: 'layup-3d',
        title: 'The 3D layup view',
        figure: <LayersFigure />,
        body: (
          <>
            <p>
              The <strong>3D layup</strong> button swaps the section for a cutaway you can
              turn with the pointer. The layers sit <strong>face to face with nothing
              between them</strong>, because that is how they get built; what makes each
              one visible is that it is cut back a little further than the one in front,
              the way a cutaway drawing has always worked, by removing material rather than
              moving it.
            </p>
            <p>
              A bridged layer is modelled as it is built: members with the layer's material
              packed between them. That is what lets you see a stud at all, since sealed
              inside one solid slab it would be invisible, and it is also how the wall is
              actually built.
            </p>
            <p>
              <strong>It is an indicator, not a drawing.</strong> No junctions, fixings or
              detailing, and nothing in it feeds the calculation. The U-value comes from
              the layer table either way. Thicknesses are to scale against each other,
              except that the very thinnest get a minimum so a vapour barrier does not
              vanish. A cavity is drawn as the gap it is, so you see through the air to the
              face behind it, with any battens or dabs standing in the opening. Click a layer,
              or its row in the layer list, to pick it out; the selection carries back to the
              section. Cross battens are not drawn yet.
            </p>
          </>
        ),
      },
      {
        id: 'drag-reorder',
        title: 'Dragging layers around',
        figure: <DragFigure />,
        body: (
          <>
            <p>
              Pick up any layer in the drawing and it comes with you at its real
              thickness, so you are moving the material rather than a marker for it. The
              rest of the build-up opens a gap where it will land. The same thing works
              from the handle in the layer list, if you would rather work there.
            </p>
            <p>
              The temperature line fades while you drag. Nothing has been recalculated
              yet: the figures follow when you let go, and fading them is the drawing
              saying so rather than showing you a line that belongs to the old order.
            </p>
            <p>
              This is the fastest way to answer the question that matters most in a retrofit:{' '}
              <em>does the insulation go inside or outside?</em> Drag it across and watch the
              temperature line and the condensation verdict change. The U-value will barely
              move; everything else will.
            </p>
          </>
        ),
      },
      {
        id: 'reverse-layers',
        title: 'The “Reverse layers” button',
        figure: <DragFigure />,
        body: (
          <>
            <p>
              Turns the whole build-up back to front in one go: the layer that faced the room
              now faces outside, and the other way round. It answers &ldquo;what if this were
              built the other way round?&rdquo; without dragging every layer across.
            </p>
            <p>
              Only the layers move. The inside and outside conditions, the element type and the
              surface resistances stay as they were, because they describe the room and the
              weather rather than the wall. Press it again to put things back.
            </p>
          </>
        ),
      },
      {
        id: 'resize-layer',
        title: 'Resizing a layer by its edge',
        figure: <ResistanceFigure />,
        body: (
          <>
            <p>
              Every layer has a grip on its <strong>outer edge</strong>, the one further
              from the room. Drag it and the layer gets thicker or thinner, in half
              millimetres, with the U-value and everything downstream of it following as
              you go. The thickness box in the layer list is the same number typed instead
              of dragged.
            </p>
            <p>
              Each grip belongs to the layer on its left, so every layer has exactly one.
              The inside face has none: it is not a boundary between two layers.
            </p>
            <p>
              The drawing normally scales so the build-up fills the width, which would make
              a growing layer push its own edge out from under your pointer, leaving you
              chasing the grip as it ran away. The scale is therefore held still for the
              length of the drag, so the edge goes exactly where you put it, and the
              drawing refits when you let go.
            </p>
          </>
        ),
      },
      {
        id: 'select-layer',
        title: 'Clicking a layer',
        figure: <LayersFigure highlightIndex={2} />,
        body: (
          <p>
            Clicking a layer in the drawing highlights it and scrolls the matching row in the
            layer list into view, and the reverse works too. Useful once a build-up has eight
            layers and three of them are called “board”.
          </p>
        ),
      },
      {
        id: 'temperature-line',
        title: 'The solid line: temperature',
        figure: <TemperatureFigure />,
        body: (
          <>
            <p>
              The line falls from the inside temperature to the outside one, and its{' '}
              <strong>steepness is what to read</strong>. It plunges through insulation, which
              resists heat, and barely tilts through brick, which does not.
            </p>
            <p>
              A layer's width on screen is its thickness; its share of the <em>drop</em> is its
              share of the resistance. Two layers of the same thickness can take completely
              different bites out of the line.
            </p>
          </>
        ),
      },
      {
        id: 'dew-point',
        title: 'The dashed line and the tinted band',
        figure: <DewPointFigure />,
        body: (
          <>
            <p>
              Warm air holds more moisture than cold air. Cool a parcel of air far enough and it
              can no longer hold what it has, and the surplus becomes liquid water. The
              temperature where that happens is the <strong>dew point</strong>.
            </p>
            <p>
              Anywhere the solid line dips into the tinted band, the construction is colder than
              the dew point. In a well-built wall that only happens out beyond the insulation,
              which is exactly where you want it.
            </p>
            <p>
              <strong>Cold is not the same as wet.</strong> An interface only collects water if
              vapour actually reaches it at saturation, and the layers on the warm side may well
              hold enough of it back. Being in the tinted band is therefore not by itself a
              fault, and most of the thickness of a well-insulated element is below the dew
              point by design. The
              drawing marks the planes where water really does form, with a drop whose area is
              proportional to how much, and the notes underneath say what is happening at each
              marked interface.
            </p>
          </>
        ),
      },
      {
        id: 'section-selector',
        title: 'The “Show” selector',
        figure: <StudFigure />,
        body: (
          <>
            <p>
              Only active when something in the build-up is bridged by studs or rafters. It picks
              which slice of the wall gets drawn: <strong>between the studs</strong>, {' '}
              <strong>through the studs</strong>, or the <strong>combined</strong> average.
            </p>
            <p>
              It changes the picture only. The condensation verdict is always worked out for
              every slice and the worst one reported, whichever you are looking at, so you
              cannot hide a problem by changing the view.
            </p>
          </>
        ),
      },
    ],
  },

  {
    id: 'strip',
    title: 'The summary strip',
    blurb: 'The row of figures under the drawing, which stays put whichever tab you are on.',
    topics: [
      {
        id: 'strip-u-value',
        title: 'U-value',
        figure: <GaugeFigure value={0.26} limit={0.26} />,
        body: (
          <>
            <p>
              How much heat crosses a square metre for each degree of difference between inside
              and out. <strong>Lower is better.</strong> It is the headline number for a reason:
              it is what building control asks for.
            </p>
            <p>
              The note underneath is the limiting value from Approved Document L, and the card
              turns green or red against it. That limit is a <em>maximum to clear</em>, not a
              target to aim at, and the document says so itself.
            </p>
          </>
        ),
      },
      {
        id: 'strip-partl-context',
        title: '“Judge the U-value as…”',
        figure: <GaugeFigure value={0.26} limit={0.18} />,
        body: (
          <>
            <p>
              The same wall is held to a different limit depending on the job. In a new
              dwelling a wall may be up to 0.26; a new or replacement wall in an existing
              dwelling must reach 0.18; a renovated one has its own figure again. Roofs and
              floors have their own sets of three.
            </p>
            <p>
              Pick the one that matches your project. Nothing else on the page changes, only
              the limit the U-value is measured against. The limits are for dwellings in
              England; Wales, Scotland and Northern Ireland set their own.
            </p>
          </>
        ),
      },
      {
        id: 'strip-thickness-mass',
        title: 'Thickness and mass',
        figure: <LayersFigure />,
        body: (
          <>
            <p>
              Thickness is the sum of the layers, and it tells you whether the build-up
              fits the space you have. Mass is the dry weight of a square metre of it.
            </p>
            <p>
              Mass counts only layers with a density in the catalogue. If some layer has none,
              the card says how many were left out, because a total that quietly omits half a
              wall is worse than no total.
            </p>
          </>
        ),
      },
      {
        id: 'strip-capacity',
        title: 'Total capacity, and why κ is different',
        figure: <KappaFigure />,
        body: (
          <>
            <p>
              <strong>Total capacity</strong> is all the heat the build-up could hold if you
              warmed every part of it through: simply ρ × c × d added up.
            </p>
            <p>
              <strong>κ</strong> further along the strip is the part a <em>daily</em> cycle can
              actually reach. A 24-hour swing only penetrates so far into a material, around
              100 mm for masonry, so mass buried deeper contributes almost nothing.
              That is why the two numbers can differ by a factor of ten, and why a very thick
              wall is not proportionally better at riding out a hot day.
            </p>
          </>
        ),
      },
      {
        id: 'strip-vapour',
        title: 'Vapour resistance (Sd)',
        figure: <VapourFigure />,
        body: (
          <>
            <p>
              S<sub>d</sub> is the build-up's resistance to water vapour, expressed as{' '}
              <strong>the depth of still air that would resist it just as much</strong>. An
              S<sub>d</sub> of 1.85 m means the wall is as hard for vapour to cross as 1.85 m of
              open air.
            </p>
            <p>
              High is not automatically good. What matters is the order: resistance on the warm
              side keeps vapour out, the same resistance on the cold side traps it in.
            </p>
          </>
        ),
      },
      {
        id: 'strip-surface',
        title: 'Inside surface',
        figure: <SurfaceConditionFigure />,
        body: (
          <>
            <p>
              The temperature of the room-side face, and the humidity of the air touching it.
              That air is always damper than the room: same moisture, colder air.
            </p>
            <p>
              At 80 % surface humidity mould will grow, and the card turns red, long before any
              liquid water appears. This is why mould shows up in cold corners and behind
              wardrobes first.
            </p>
          </>
        ),
      },
      {
        id: 'strip-condensation',
        title: 'Condensation',
        figure: <GlaserFigure />,
        body: (
          <p>
            Whether water is forming <em>inside</em> the build-up under the conditions set on the
            Conditions box, and if so how fast. “None” means the vapour stays below saturation
            all the way through. Any number here is worth understanding before you build, so
            follow it to the Moisture tab, which shows where and whether it dries out again.
          </p>
        ),
      },
      {
        id: 'strip-dynamic',
        title: 'Decrement, time shift and κᵢ',
        figure: <WaveFigure />,
        body: (
          <>
            <p>
              The three summer numbers. <strong>Decrement</strong> is the fraction of an outdoor
              temperature swing that reaches the inside surface, so 0.42 means 42 % gets
              through.{' '}
              <strong>Time shift</strong> is how many hours later it arrives.{' '}
              <strong>κᵢ</strong> is how much heat the inside face can soak up and give back.
            </p>
            <p>
              A heavy wall damps the swing and delays it past the evening, when you can open a
              window. A lightweight one passes the afternoon straight through. Two walls with an
              identical U-value can be completely different here.
            </p>
          </>
        ),
      },
      {
        id: 'strip-no-rating',
        title: 'Why nothing is scored out of five',
        figure: <GaugeFigure value={0.2} limit={0.26} />,
        body: (
          <>
            <p>
              Two figures carry a verdict, and each names the source: the U-value against
              Approved Document L, and the surface humidity against the 80 % mould threshold in
              BS EN ISO 13788. Both of those are published limits.
            </p>
            <p>
              Nothing published grades a wall's mass, capacity or S<sub>d</sub> from poor to
              excellent, so OpenUValue does not either. A five-star scale invented here would sit
              in the most prominent place on the page looking exactly as authoritative as the two
              that are real.
            </p>
          </>
        ),
      },
    ],
  },

  {
    id: 'layers',
    title: 'Building the layers',
    blurb: 'The Layers box on the Build-up tab: every field, and what it changes.',
    topics: [
      {
        id: 'add-layer',
        title: 'Adding a layer or a cavity',
        figure: <LayersFigure />,
        body: (
          <p>
            <strong>+ layer</strong> adds a blank layer at the outside end, ready for a material
            and a thickness, and it can be dragged wherever you want it. Add a{' '}
            <strong>cavity</strong> instead when the gap is air rather than a product. An air
            layer is handled differently, because air insulates by not moving and stops doing so
            once it can circulate. To add a particular material in a particular place in one
            step, use the materials tray under the drawing instead.
          </p>
        ),
      },
      {
        id: 'layer-row-buttons',
        title: 'The buttons on each layer',
        figure: <LayersFigure highlightIndex={1} />,
        body: (
          <>
            <p>
              Each layer carries its own name, which you can type over, and a row of buttons
              along its foot. <strong>↑</strong> and <strong>↓</strong> move it one place
              inwards or outwards, the same as dragging it by the ⠿ handle.{' '}
              <strong>insert below</strong> adds a blank layer straight after it, on its
              outside. <strong>delete</strong> removes it, with no undo, so copy the share link
              first if you might want it back.
            </p>
            <p>
              <strong>+ cavity behind</strong> adds an air cavity on the outside of the layer
              and guesses its type from the layers either side of it: a gap between two leaves
              of masonry is read as a clear cavity, one with only tiles or cladding outside it
              as ventilated, one just behind a dry lining as a service void. The guess is
              marked as a guess until you pick a cavity type yourself. A cavity dropped from
              the materials tray is guessed the same way.
            </p>
          </>
        ),
      },
      {
        id: 'palette',
        title: 'The materials palette',
        figure: <PickerFigure />,
        body: (
          <>
            <p>
              The tray under the drawing, for building a wall the other way round: instead of
              adding a layer and then choosing what it is made of, pick the thing and put it
              where it goes. <strong>Drag a chip onto the drawing</strong> and the layer lands in
              the gap you let go over, with a mark showing which gap that will be before you
              commit to it.
            </p>
            <p>
              A chip is also a button, because a touch screen has no drag to speak of. Clicking
              one adds its layer after whichever layer is selected, or on the outside when none
              is, and selects what it just added, so a second click lands after that. That is a
              build-up assembled a layer at a time without touching the list.
            </p>
            <p>
              Each chip lands at a common thickness — a brick at 102.5 mm, a sheet of
              plasterboard at 12.5 — which is what they are sold as rather than anything a
              standard fixes. Drag the layer&rsquo;s edge, or type in the list, to make it the
              real figure. The palette is the same catalogue the list uses, so nothing here is a
              material you could not have reached the long way round, and a cavity dropped
              between two leaves is classified from its neighbours exactly as the list&rsquo;s
              own cavity button does it.
            </p>
          </>
        ),
      },
      {
        id: 'layer-material',
        title: 'Choosing a material',
        figure: <PickerFigure />,
        body: (
          <>
            <p>
              The picker is grouped by what things are, with the section hatch beside each entry
              and λ and μ on the right, so you can choose on the numbers rather than the name.
              Type to search, arrow keys to move, Enter to pick.
            </p>
            <p>
              Choosing a material fills in λ, μ, density and specific heat together. Density and
              specific heat are not editable, because they never affect a U-value, only mass
              and the summer figures.
            </p>
          </>
        ),
      },
      {
        id: 'layer-lambda',
        title: 'λ, thermal conductivity',
        figure: <ResistanceFigure />,
        body: (
          <>
            <p>
              How readily heat passes through the material itself, in W/(m·K).{' '}
              <strong>Lower insulates better.</strong> Mineral wool is about 0.035; brick is
              about 0.77, some twenty times worse.
            </p>
            <p>
              The layer's resistance is thickness ÷ λ, which is why 100 mm of quilt beats a metre
              of brick. Typing your own λ is allowed, and it detaches the layer from the
              catalogue entry, since it is no longer that product.
            </p>
          </>
        ),
      },
      {
        id: 'layer-mu',
        title: 'μ and δ, vapour',
        figure: <VapourFigure barrier />,
        body: (
          <>
            <p>
              <strong>μ</strong> is how many times harder than still air the material is for
              water vapour to cross. Air is 1 by definition; mineral wool is about 1; brick about
              10; a polythene sheet is around 100 000.
            </p>
            <p>
              δ beside it is the same property the other way up: permeability rather than
              resistance. The layer's S<sub>d</sub> is μ × thickness, which is how a 0.2 mm sheet
              can out-resist a metre of masonry.
            </p>
          </>
        ),
      },
      {
        id: 'layer-provenance',
        title: 'The marker beside a material',
        figure: <ProvenanceFigure />,
        body: (
          <>
            <p>
              How far the material's numbers have been traced to a published source. Green: every
              value cites a clause. Amber: some do. Grey: not yet checked, and the entry says so
              rather than inventing a reference.
            </p>
            <p>
              An asterisk means <strong>assumed</strong>: the conventional value for that material,
              which every public source we could reach agrees on, but which nobody here has read in
              the standard that governs it. It is believed right and it is not verified: good
              enough to model with, not good enough to submit. Most vapour resistance factors are
              in this state, because the tables that would settle them are not published free.
            </p>
            <p>
              Hover for the source. This is what VERIFY.md records, shown where you choose
              rather than in a file. An unattributed figure should never pass for a checked
              one, and an assumed one should never pass for a read one.
            </p>
          </>
        ),
      },
      {
        id: 'layer-bridging',
        title: 'Studs, rafters and members crossing a cavity',
        figure: <StudFigure />,
        body: (
          <>
            <p>
              Insulation between timbers is not one material. It is quilt for most of the area
              and wood where the studs are, and wood conducts about four times better. Ignoring
              them can under-state a wall's U-value by a fifth.
            </p>
            <p>
              <strong>A cavity can be bridged too.</strong> Battens behind a dry lining,
              plaster dabs, or a stud through a service void are the same situation: the
              layer is air over most of its area and something more conductive where the
              members are. BR 443 is explicit that the pockets left between them still
              count as air layers, and names the space between battens in a dry-lined wall
              as its own example, so the air keeps a cavity&rsquo;s resistance and the
              members carry their own. Two presets set the standard&rsquo;s own figures:
              dabs at 20 % of the face, and 47 mm battens at 600 mm centres, whose 11.8 %
              is more than 47 ÷ 600 because the top and bottom rails count as well.
            </p>
            <p>
              That only holds while the pockets stay shallow relative to their width. Once
              a cavity is deep and the members are close, the space stops being an air
              layer and becomes an air <em>void</em>, which takes a different resistance,
              so the calculation says so rather than carrying on quietly.
            </p>
            <p>
              Give the member's width and the distance between members and the bridged
              fraction follows. The distance can be either <strong>centre to
              centre</strong>, which is how members are specified on a drawing, or the{' '}
              <strong>clear gap</strong> between them, which is what a tape measure gives
              on site. They are not interchangeable: 38 mm studs at 600 mm centres bridge
              7.3 % of the wall, while the same studs with a 600 mm clear gap bridge 7.0 %,
              because their centres are 638 mm apart.
            </p>
            <p>
              Once a width and a spacing are set, the members appear in the cross-section
              itself, inside the layer they bridge, at their true width and pitch. The
              height of the drawing is a length of wall, and the caption says how much, so
              the spacing you can see is the spacing you typed. The temperature line is an
              overlay on that section, read against the degrees axis on the right: a
              member drawn level with a temperature does not mean anything by it.
            </p>
            <p>
              Or enter a fraction directly if you are using a convention. BR 443 publishes
              defaults, 15 % for a timber-framed wall, which is more than width ÷ spacing
              because plates, lintels and doubled studs at openings are timber too. A layer
              given that way has no geometry to draw, so it carries its percentage on its
              label but no members in the drawing.
            </p>
          </>
        ),
      },
      {
        id: 'layer-readouts',
        title: 'The R and Sd readouts on each row',
        figure: <ResistanceFigure />,
        body: (
          <p>
            What that layer contributes, worked out as you type. <strong>R</strong> is its thermal
            resistance in m²K/W, or thickness ÷ λ. <strong>S<sub>d</sub></strong> is its vapour
            resistance as an equivalent depth of air, or μ × thickness. Together they tell you
            whether a layer is earning its place.
          </p>
        ),
      },
      {
        id: 'layer-cavity',
        title: 'Cavities: type, ventilation and reflective faces',
        figure: <CavityFigure />,
        body: (
          <>
            <p>
              An air cavity insulates because the air in it is still. Let outside air wash through
              and it stops: an <strong>unventilated</strong> cavity carries its full resistance, a{' '}
              <strong>well-ventilated</strong> one carries none, and everything outside it is
              disregarded too, because it is at outdoor temperature. The openings figure, in mm²
              per metre, is what decides which of the three classes applies.
            </p>
            <p>
              <strong>Cavity type</strong> sets all of that at once for the cases that actually
              come up. The timber frame one is worth knowing about: a timber framed wall has to be
              drained and vented, and the NHBC requirement of an open perpend every 1.2 m comes to
              roughly 580 mm² per metre, over the 500 mm² threshold, so that cavity is{' '}
              <em>slightly</em> ventilated, not unventilated, even though nobody set out to
              ventilate it.
            </p>
            <p>
              <strong>Surfaces</strong> is about radiation. Most of the heat crossing a still air
              gap crosses it as radiation, so a reflective face such as foil on the back of a
              board roughly doubles the cavity's resistance: 0.44 m²K/W in a wall against 0.18. It only
              counts where the foil actually faces the air space; foil buried between two solid
              layers does nothing at all. Below 25 mm the benefit falls away, and for a thin
              reflective cavity in a roof or floor there is no published figure, so the tool uses
              the ordinary value and says so rather than guessing.
            </p>
          </>
        ),
      },
    ],
  },

  {
    id: 'conditions',
    title: 'Conditions',
    blurb: 'The Conditions box, which sets which way heat flows and what is on each side, and the Location box.',
    topics: [
      {
        id: 'conditions-direction',
        title: 'Wall, roof or floor, and the pitch',
        figure: <DirectionFigure />,
        body: (
          <>
            <p>
              Heat rises, so the direction it travels changes the surface resistances and the
              behaviour of any cavity. Say what you are building and the direction follows:
              a wall is horizontal, a floor is downward, and a roof depends on how steep it is.
              The choice also decides which Approved Document L limit the summary strip measures
              you against, and it tilts the 3D layup to match.
            </p>
            <p>
              <strong>The pitch rule catches people out, this tool included.</strong> BS EN ISO
              6946 tabulates by the direction heat <em>flows</em>, not by the angle of the
              surface, and the horizontal column covers flow within ±30° of the horizontal
              plane. Heat leaves normal to the face, so a roof pitched θ sends it out at (90 − θ)
              from horizontal: a 45° roof still counts as upward heat flow, and only at 60° does
              the flow come inside the band and take a wall&rsquo;s R<sub>si</sub> of 0.13
              instead of 0.10. The figure beside the pitch draws the slope, the flow and the band
              together, and shades the band when the flow is inside it.
            </p>
            <p>
              A steep roof takes a wall&rsquo;s surface resistances and is still a roof to the
              limiting values, which are set by what the element is rather than by where its heat
              goes. A cold loft ceiling is a roof at 0°.
            </p>
          </>
        ),
      },
      {
        id: 'conditions-inside',
        title: 'Inside temperature and humidity',
        figure: <DewPointFigure />,
        body: (
          <p>
            These set the warm end of the temperature line and, with it, the dew point. Humidity
            matters more than people expect: at 20 °C, air at 40 % reaches its dew point at 6 °C,
            but at 65 % it gets there at 13 °C, which can be the difference between a wall
            that condenses and one that does not. A steamy bathroom is a different building from a dry living room.
          </p>
        ),
      },
      {
        id: 'conditions-surface',
        title: 'Normal or reduced air circulation',
        figure: <SurfaceConditionFigure />,
        body: (
          <>
            <p>
              The standard surface resistance assumes air can move freely across the wall. Behind
              a wardrobe, in a corner, or in a niche, it cannot, so the surface runs colder than
              the room and the air against it is damper.
            </p>
            <p>
              Switch to <strong>reduced</strong> to see how much colder those spots run: the
              temperature line and the U-value follow the higher surface resistance. The U-value
              that gives is no longer a BR 443 U-value, and the box says so.
            </p>
            <p>
              <strong>The mould and surface-damp check does not use this setting.</strong>{' '}
              BS EN ISO 13788 fixes the surface resistance for that check, at a figure that
              already stands for a poorly ventilated corner, so the verdict is the same
              whichever option is chosen here.
            </p>
          </>
        ),
      },
      {
        id: 'conditions-outside',
        title: 'What is on the other side',
        figure: <EnvironmentFigure />,
        body: (
          <>
            <p>
              An outside wall faces weather. A ceiling may face an unheated loft. A party floor
              faces another heated room. Each has its own outer surface resistance and its own
              temperature, and picking the wrong one moves the answer a long way.
            </p>
            <p>
              Rear-ventilated cladding is a special case: the cavity is at outdoor temperature, so
              the outer surface behaves like an indoor one. Ground is listed but not supported,
              because it needs BS EN ISO 13370, which this tool does not do, so it refuses rather
              than guessing.
            </p>
          </>
        ),
      },
      {
        id: 'conditions-defaults',
        title: 'The “common defaults” button',
        figure: <EnvironmentFigure />,
        body: (
          <p>
            Sets both sides back to ordinary starting values for the environment you have chosen,
            so you can get back to a sensible baseline after experimenting. It changes only the
            temperatures and humidities, never your layers.
          </p>
        ),
      },
      {
        id: 'conditions-exposure',
        title: 'The Location box: wind-driven rain',
        figure: <EnvironmentFigure />,
        body: (
          <>
            <p>
              Wind-driven rain is graded in four numbered zones, from 1 sheltered to 4 very
              severe, by how much water a spell of weather throws at a square metre of wall. It
              has its own box because it is not an inside or an outside condition and it changes
              no calculated figure. What it changes is which constructions are allowed: a fully
              filled cavity in the worst zones is a way of bridging rain across to the inner leaf,
              and the tool says so rather than quietly calculating it.
            </p>
            <p>
              Find your zone on Diagram 12 of Approved Document C, on page 34, and pick it here.
              The map is not shown in this page and cannot be: it is Crown copyright, free to
              download but not free to republish. Nor is it redrawn, because the zones are
              geography rather than a table and an approximation of them would give a wall a mile
              the wrong side of a line a confident wrong answer.
            </p>
            <p>
              Two adjustments belong to you rather than to the map. Paragraph 5.16 adds a zone
              where local conditions accentuate the wind, such as an open hillside or a valley
              funnelling it onto the wall, and subtracts one where the wall does not face into the
              prevailing wind. A site-specific calculation to BS 8104 replaces the map outright.
            </p>
          </>
        ),
      },
    ],
  },

  {
    id: 'result',
    title: 'The Result box',
    blurb: 'The full thermal result, its breakdown, and the things it refuses to answer.',
    topics: [
      {
        id: 'result-headline',
        title: 'The headline U-value',
        figure: <GaugeFigure value={0.26} limit={0.26} />,
        body: (
          <p>
            Reported to two significant figures, which is what BS EN ISO 6946 asks for. A wall
            calculated to 0.2583 is not known to four digits, and printing them would imply it
            was. The full-precision figure is used everywhere internally; only the display is
            rounded.
          </p>
        ),
      },
      {
        id: 'result-air-gaps',
        title: 'Air gaps in the insulation',
        figure: <StudFigure />,
        body: (
          <>
            <p>
              Insulation is rarely as perfect as the specification. BR 443 recognises three levels:
              no meaningful gaps, gaps that bridge the layer, and gaps that let air circulate
              between the warm and cold sides. Each adds a correction to the U-value.
            </p>
            <p>
              Level 1 is the default, because the standard says to assume it unless the
              conditions for level 0 are met. If the corrections <em>together</em> come to
              under 3 % of the U-value they may be left off, and they are, but the figures
              are still shown so you can see what was dropped. The 3 % test is against the
              sum, so air gaps and fasteners are judged jointly, never one at a time.
            </p>
          </>
        ),
      },
      {
        id: 'result-fasteners',
        title: 'Mechanical fasteners',
        figure: <StudFigure />,
        body: (
          <>
            <p>
              Screws, wall ties and brackets through insulation are metal, and metal
              through insulation is a short circuit. BR 443 requires a correction for
              them, so a build-up with insulation fixed through and no ΔU<sub>f</sub> is
              reporting a better U-value than it has.
            </p>
            <p>
              The one figure you have to supply is <strong>χ</strong>, the point thermal
              transmittance of a single fastener in W/K. It cannot be worked out from the
              build-up. It comes from a BS EN ISO 10211 model or from the fixing
              manufacturer, usually in a BBA certificate. Multiply it by the number of
              fasteners per square metre and that is the correction.
            </p>
            <p>
              Two cases need no correction, and they mean different things. A flat roof
              whose composite fixings are recessed by at least half their length, at no
              more than 15 per square metre, genuinely needs none. A fixing with both ends
              against metal sheets is a different matter: the method does not apply at all
              there, so the tool reports nothing rather than reporting zero.
            </p>
          </>
        ),
      },
      {
        id: 'result-breakdown',
        title: 'Total resistance and the layer table',
        figure: <ResistanceFigure />,
        body: (
          <p>
            Every layer's resistance, plus the two surface films, adding up to the total. The
            U-value is one divided by that total. This is the table to scan when a U-value is
            worse than expected: it is almost always one layer doing nothing.
          </p>
        ),
      },
      {
        id: 'result-combined',
        title: 'The combined method',
        figure: <CombinedFigure />,
        body: (
          <>
            <p>
              A bridged wall has no single resistance, so BS EN ISO 6946 brackets it: an upper
              limit assuming heat cannot move sideways at all, a lower limit assuming it moves
              sideways freely, and the answer is the average of the two.
            </p>
            <p>
              If those two limits are more than 1.5 times apart the bracket is too loose to be
              useful, and <strong>no U-value is reported at all</strong>, because the element
              needs proper numerical modelling instead. Metal through the insulation is excluded outright for
              the same reason.
            </p>
          </>
        ),
      },
      {
        id: 'result-surface-condensation',
        title: 'Surface condensation',
        figure: <SurfaceConditionFigure />,
        body: (
          <p>
            Whether the room-side face falls below the dew point of the room air: the wet-window
            failure, on a wall. It is the most visible kind and the least serious, because you can
            see it happening. The mould threshold bites well before it.
          </p>
        ),
      },
      {
        id: 'result-dew-screen',
        title: 'Dew-point screening',
        figure: <DewPointFigure failing />,
        body: (
          <p>
            A quick comparison at every interface of the temperature there against the dew point
            there. It is a screening test, not a verdict: it flags where to look. The Moisture tab
            does the full BS EN ISO 13788 assessment, which accounts for how hard the vapour had
            to work to arrive.
          </p>
        ),
      },
      {
        id: 'result-warnings',
        title: 'Notes and limits',
        figure: <CombinedFigure />,
        body: (
          <p>
            Where the calculation has hit the edge of what the method covers: a cavity outside the
            tabulated range, an interpolation, an in-house convention, a correction applied
            unscaled. They are shown rather than hidden, so you can see where the method
            stopped applying cleanly.
          </p>
        ),
      },
    ],
  },

  {
    id: 'summer',
    title: 'Summer performance',
    blurb: 'What the build-up does to a temperature that swings, rather than one held steady.',
    topics: [
      {
        id: 'summer-decrement',
        title: 'Decrement factor',
        figure: <WaveFigure />,
        body: (
          <p>
            The share of an outdoor temperature swing that makes it to the inside surface over 24
            hours. 0.42 means a 10 °C swing outside arrives as 4.2 °C inside. Lower is calmer
            indoors, and it is mass, not insulation, that does most of the work.
          </p>
        ),
      },
      {
        id: 'summer-time-shift',
        title: 'Time shift',
        figure: <WaveFigure />,
        body: (
          <p>
            How much later the indoor peak arrives. Get it past the evening and the heat lands when
            the outside air is cooler and you can open a window; land it at 4 p.m. and it adds to
            the worst part of the day. A masonry cavity wall manages around nine hours; a
            lightweight panel manages two or three.
          </p>
        ),
      },
      {
        id: 'summer-kappa',
        title: 'κᵢ and κₑ',
        figure: <KappaFigure />,
        body: (
          <>
            <p>
              The heat each face can absorb and release over a cycle. κ<sub>i</sub> is the one that
              matters for comfort, and the one SAP 10.3 uses for thermal mass.
            </p>
            <p>
              A large gap between the two faces means the insulation is cutting one side off from
              the mass. That is exactly what internal wall insulation does: the U-value improves
              and the thermal mass disappears behind the insulation.
            </p>
          </>
        ),
      },
      {
        id: 'summer-y-value',
        title: 'Periodic transmittance Y',
        figure: <WaveFigure />,
        body: (
          <p>
            The swinging counterpart of the U-value, in the same units. Where U says how much heat
            crosses under a steady difference, Y says how much of a <em>cycling</em> difference
            crosses. Divide Y by U and you get the decrement factor.
          </p>
        ),
      },
      {
        id: 'summer-sections',
        title: 'Between the studs, and through them',
        figure: <StudFigure />,
        body: (
          <p>
            BS EN ISO 13786 is written for layers that run right across an element. A bridged one is
            not that, so each section is calculated separately and shown with its area share rather
            than being averaged into a single number. Timber stores far more heat than the
            insulation it displaces, and averaging that away would hide it.
          </p>
        ),
      },
    ],
  },

  {
    id: 'moisture',
    title: 'The Moisture tab',
    blurb: 'Where water forms inside a build-up, how much, and whether it leaves again.',
    topics: [
      {
        id: 'moisture-humidity',
        title: 'How damp does it get inside the wall',
        figure: <VapourFigure />,
        body: (
          <p>
            Relative humidity at every point through the build-up, drawn against real thickness so
            it lines up with the cross-section above. Where it touches 100 % the air cannot hold
            what it carries and water appears. The 80 % line is where mould becomes possible.
          </p>
        ),
      },
      {
        id: 'moisture-path',
        title: 'The path selector',
        figure: <StudFigure />,
        body: (
          <p>
            On a bridged build-up, which slice is being plotted. Worth switching: the stud path is
            colder at the inside surface, and the insulation path is colder further out, so they
            fail in different places. The verdict always uses the worst of them.
          </p>
        ),
      },
      {
        id: 'moisture-glaser',
        title: 'Where does it condense',
        figure: <GlaserFigure />,
        body: (
          <>
            <p>
              The dots are how much vapour pressure each interface could hold at its temperature.
              The straight line is what the vapour actually does: it takes the most direct route it
              can without ever exceeding what the material can hold, like a string pulled taut
              underneath the dots.
            </p>
            <p>
              Wherever the taut line touches a dot, the vapour has run out of room and water forms
              there. If it touches nothing, the build-up is stopping the moisture before it reaches
              anywhere cold enough.
            </p>
          </>
        ),
      },
      {
        id: 'moisture-seasons',
        title: 'Over a season, does it dry out',
        figure: <SeasonFigure />,
        body: (
          <>
            <p>
              Water that collects over a winter is only a problem if it does not leave again. Set
              how long each season lasts and what the weather does in the drying one, and this
              accumulates at the calculated rate and then evaporates it.
            </p>
            <p>
              A build-up that gains a little every year and never gives it back is the failure that
              rots a wall slowly rather than quickly, which is much worse, because nobody notices
              for a decade.
            </p>
          </>
        ),
      },
      {
        id: 'moisture-no-pass-mark',
        title: 'Why there is no pass mark here',
        figure: <SeasonFigure />,
        body: (
          <p>
            A formal assessment compares the accumulated water against a permitted maximum, using
            seasons and weather taken from a design climate for the location. OpenUValue ships
            none of those, because it cannot attribute them to a clause, so it asks you for them
            instead and gives no verdict. The arithmetic is real; deciding what counts as too much
            stays with whoever can cite the limit.
          </p>
        ),
      },
      {
        id: 'moisture-mould',
        title: 'Mould on the inside surface',
        figure: <SurfaceConditionFigure />,
        body: (
          <p>
            Mould needs neither condensation nor liquid water, only air that stays damp against a
            surface, which happens at about 80 % surface humidity. Since a cold surface makes the
            air against it damper than the room, this bites long before anything looks wet, and it
            bites first in corners and behind furniture.
          </p>
        ),
      },
    ],
  },

  {
    id: 'energy',
    title: 'The Energy and Retrofit tabs',
    blurb: 'What the element costs to heat through, and what improving it buys back.',
    topics: [
      {
        id: 'energy-season',
        title: 'Heat lost over a heating season',
        figure: <MonthsFigure />,
        body: (
          <>
            <p>
              A U-value is a rate: watts per square metre for every degree of difference. Multiply
              it by how cold it actually gets where the building is, month by month, and you get
              something you can spend: kilowatt-hours a year for each square metre of the
              element. Months warm enough not to need heating are left out entirely.
            </p>
            <p>
              This is the heat lost <em>through this element</em>, not the building’s demand.
              Nothing here knows about the other walls, the windows, the roof, the air changes or
              the heat the occupants and the sunshine put back in.
            </p>
          </>
        ),
      },
      {
        id: 'energy-inputs',
        title: 'Where the building is, and how it is heated',
        figure: <MonthsFigure />,
        body: (
          <>
            <p>
              <strong>Where the building is</strong> picks one of the SAP climate regions, or
              the UK average. Each has its own mean temperature for every month, so the same
              element loses more heat in the north of Scotland than on the south coast.
            </p>
            <p>
              <strong>How it is heated</strong> turns heat into fuel. A boiler burns more than
              a unit of fuel for each unit of heat, so its efficiency is below 1; a heat pump
              moves more heat than the electricity it uses, so its seasonal coefficient of
              performance (CoP) is above 1. Choosing a heating type fills in a typical figure
              and the note under the controls says what it assumes. Type your own if you
              know it.
            </p>
            <p>
              <strong>Fuel price</strong> is in pence per kWh of fuel. The starting figures
              are SAP&rsquo;s, which date from 2021 and are well out of date, so put in what
              you actually pay.
            </p>
          </>
        ),
      },
      {
        id: 'energy-months',
        title: 'The heating base, and month by month',
        figure: <MonthsFigure />,
        body: (
          <>
            <p>
              The bars show the heat lost through a square metre in each month. A month only
              counts as a heating month when its mean outside temperature is below the{' '}
              <strong>heating base</strong>; the others are greyed out and marked
              &ldquo;no heating&rdquo;.
            </p>
            <p>
              The base is not a figure from SAP. It stands for the outside temperature below
              which the house needs its heating on, which depends on how well insulated and
              airtight the whole house is and how much heat people and appliances give off.
              15.5 °C is the long-standing UK convention; a very well insulated house might
              manage with a lower one. Changing it changes which months count, not what each
              month loses.
            </p>
          </>
        ),
      },
      {
        id: 'energy-figures',
        title: 'Fuel, carbon, primary energy and cost',
        figure: <MonthsFigure />,
        body: (
          <>
            <p>
              All five figures are for one square metre of the element over a year.{' '}
              <strong>Heat lost</strong> is what passes through it. <strong>Fuel</strong> is
              what the heating burns or draws to replace that heat, after its efficiency.{' '}
              <strong>Carbon</strong> and <strong>primary energy</strong> multiply the fuel
              by SAP&rsquo;s factors for that fuel; primary energy also counts the energy
              spent getting the fuel to the house. <strong>Cost</strong> is the fuel at the
              price you set.
            </p>
            <p>
              Multiply by the area of the element to get a figure for a whole wall or roof.
              The Retrofit tab does that for you.
            </p>
          </>
        ),
      },
      {
        id: 'retrofit',
        title: 'Retrofit: comparing before and after',
        figure: <GaugeFigure />,
        body: (
          <>
            <p>
              The build-up on the other tabs is the element <strong>after</strong> the work.
              In step 1, tick the layers the work adds, and what is left is the element as it
              was. Both sides of the comparison are then build-ups this tool has calculated,
              rather than a U-value remembered from somewhere else.
            </p>
            <p>
              The difference between the two, over a heating season and through the heating
              system you choose, is a saving in heat, fuel, carbon and money. The cost of the
              work divided by the money saved each year is the payback in years.
            </p>
            <p>
              The region, heating type, efficiency and fuel price sit behind the{' '}
              <strong>Assumptions</strong> line in step 3, which says in one line what is
              currently assumed. They are set separately from the Energy tab&rsquo;s, so check
              them here too.
            </p>
          </>
        ),
      },
      {
        id: 'retrofit-sheets',
        title: 'Costing the work by the sheet',
        figure: <LayersFigure />,
        body: (
          <>
            <p>
              Nobody buys 50 m² of insulation; they buy boards in whatever size the merchant
              stocks, and pay for whole ones however much of the last is left over. So step 2
              asks for the area treated and the price of a single sheet, which is a number you
              can read off a quote, and works out the rest.
            </p>
            <p>
              Pick a common sheet size or type the width and length. For rolls of quilt, type
              the roll&rsquo;s width and length and its price. The drawing shows the count,
              with the unused part of the last sheet hatched, because that is the part people
              query.
            </p>
            <p>
              The count is area divided by sheet size, rounded up. Cuts at reveals, corners
              and openings mean a real job needs a few more. <strong>Labour and the
              rest</strong> covers fitting, access, fixings and anything else; leave it at zero
              and every figure below is for materials only.
            </p>
          </>
        ),
      },
      {
        id: 'retrofit-payback',
        title: 'Why the real payback is usually longer',
        figure: <GaugeFigure />,
        body: (
          <p>
            Treat the payback as the optimistic end. It assumes today&rsquo;s fuel price
            forever. It assumes every kilowatt-hour saved turns into money, when people in a
            house that was hard to heat often take some of the saving as warmth instead. And
            it counts no carbon or money spent making the insulation in the first place. None
            of that makes the work less worth doing: a wall that stays warm, dry and free of
            mould is worth something no payback figure shows.
          </p>
        ),
      },
    ],
  },

  {
    id: 'trust',
    title: 'Sharing, and how much to trust this',
    blurb: 'The share link, the examples, and the parts that are still unverified.',
    topics: [
      {
        id: 'share-link',
        title: 'The share link',
        figure: <ShareFigure />,
        body: (
          <>
            <p>
              The entire build-up is encoded in the page address. Copy the link and whoever opens
              it sees exactly your wall, with no account, no upload and no server. The link{' '}
              <em>is</em> the file.
            </p>
            <p>
              Bookmark variants to compare them. An old link still opens after the tool has
              changed: anything it does not mention falls back to the current default.
            </p>
          </>
        ),
      },
      {
        id: 'examples',
        title: 'The example buttons',
        figure: <LayersFigure />,
        body: (
          <p>
            Three starting points written for this tool: a filled-cavity masonry wall, a timber
            frame wall, and a cold roof insulated at ceiling level with a ventilated loft above
            it. The last one is the commonest thing over a UK top floor, and it sets the element
            to a roof, so the drawing turns with it. They replace whatever is on screen, so copy
            your link first if you want to come back to it. None is taken from anyone else's
            example library.
          </p>
        ),
      },
      {
        id: 'verify',
        title: 'What still needs checking',
        figure: <ProvenanceFigure />,
        body: (
          <>
            <p>
              Several standards this tool follows are not free to read. Where a value or a clause
              reference could not be confirmed against a printed copy, it is marked rather than
              guessed, and listed in VERIFY.md with what would change if it turned out to be wrong.
            </p>
            <p>
              That file is linked in the footer and is worth a look before you rely on a number for
              anything that matters. A guessed citation would be worse than an admitted gap.
            </p>
          </>
        ),
      },
      {
        id: 'not-built',
        title: 'What is not built yet',
        figure: <CombinedFigure />,
        body: (
          <p>
            The fastener correction here takes the detailed route, where you supply a point
            thermal transmittance. The approximate route in BS EN ISO 6946 Annex F.3.2,
            which works from the fixing&rsquo;s own dimensions, is not offered yet: its formula
            was taken from a draft of the standard and still has to be checked against the
            published text. The inverted-roof correction and crossed battens are not built.
            Ground-bearing floors need a different standard and are refused rather than
            approximated. The moisture check runs over two seasons you set, not the twelve
            months of design weather a formal assessment uses. Overheating proper needs solar
            gain and a room model, so the summer figures here are an input to that, not a
            substitute. ROADMAP.md in the footer keeps the current list.
          </p>
        ),
      },
    ],
  },
];

export const ALL_TOPICS: readonly GuideTopic[] = CHAPTERS.flatMap((chapter) => chapter.topics);

export function findTopicIndex(topicId: string): number {
  return ALL_TOPICS.findIndex((topic) => topic.id === topicId);
}
