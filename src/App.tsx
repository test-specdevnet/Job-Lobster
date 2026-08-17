import { Lobster } from "./components/Lobster";

const stars = Array.from({ length: 28 }, (_, index) => ({
  id: index,
  left: `${(index * 37 + 11) % 96}%`,
  top: `${(index * 19 + 4) % 47}%`,
  delay: `${(index % 9) * -0.43}s`,
  size: `${index % 6 === 0 ? 3 : index % 3 === 0 ? 2 : 1}px`,
}));

export default function App() {
  return (
    <main className="beach-scene">
      <div className="sky" aria-hidden="true">
        <div className="moon"><span /></div>
        <div className="cloud cloud-one" />
        <div className="cloud cloud-two" />
        <div className="stars">
          {stars.map((star) => (
            <i
              key={star.id}
              style={{
                left: star.left,
                top: star.top,
                width: star.size,
                height: star.size,
                animationDelay: star.delay,
              }}
            />
          ))}
        </div>
      </div>

      <div className="horizon-glow" aria-hidden="true" />
      <div className="island island-left" aria-hidden="true" />
      <div className="island island-right" aria-hidden="true" />

      <div className="ocean" aria-hidden="true">
        <div className="wave wave-back" />
        <div className="wave wave-mid" />
        <div className="wave wave-front" />
        <div className="moon-path" />
      </div>

      <div className="shore" aria-hidden="true">
        <div className="foam foam-one" />
        <div className="foam foam-two" />
      </div>
      <div className="sand" aria-hidden="true">
        <span className="shell shell-one" />
        <span className="shell shell-two" />
        <span className="pebble pebble-one" />
        <span className="pebble pebble-two" />
      </div>

      <div className="lobster-route">
        <Lobster />
      </div>

      <header className="brand-mark">
        <span className="brand-dot" />
        <span>Job Lobster</span>
      </header>
      <p className="status-copy">out searching</p>
      <p className="sr-only">
        Job Lobster is the data service behind Job Globe. The public API is available at /api/v1/jobs.
      </p>
    </main>
  );
}
