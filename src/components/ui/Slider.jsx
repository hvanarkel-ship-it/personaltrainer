export default function Slider({ value, min = 0, max = 100, step = 1, onChange, labelMin, labelMax, id }) {
  return (
    <div className="slider-wrap">
      {(labelMin || labelMax) && (
        <div className="slider-labels">
          <span className="t-xs">{labelMin}</span>
          <span className="t-xs">{labelMax}</span>
        </div>
      )}
      <input
        id={id}
        type="range"
        className="slider-track"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange?.(Number(e.target.value))}
      />
    </div>
  )
}
