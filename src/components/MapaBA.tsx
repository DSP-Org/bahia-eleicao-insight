import { useEffect, useRef } from "react";
import type { Layer, Map as LMap, GeoJSON as LGeo } from "leaflet";
import { useGeo } from "@/lib/eleicoes";

type Props = {
  fill: (ibge: string) => string;
  tooltip: (ibge: string) => string;
  onSelect?: (ibge: string) => void;
  selected?: string;
  height?: number;
};

export function MapaBA({ fill, tooltip, onSelect, selected, height = 560 }: Props) {
  const { data: geo } = useGeo();
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LMap | null>(null);
  const layer = useRef<LGeo | null>(null);
  const fns = useRef({ fill, tooltip, onSelect, selected });
  fns.current = { fill, tooltip, onSelect, selected };

  useEffect(() => {
    if (!geo || !el.current || map.current) return;
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !el.current) return;
      const m = L.map(el.current, { zoomSnap: 0.25, attributionControl: false, scrollWheelZoom: false });
      map.current = m;
      const g = L.geoJSON(geo, {
        style: () => ({}),
        onEachFeature: (f, l: Layer) => {
          const id = String(f.properties?.codarea);
          l.on("click", () => fns.current.onSelect?.(id));
          l.bindTooltip(() => fns.current.tooltip(id), { sticky: true });
        },
      }).addTo(m);
      layer.current = g;
      m.fitBounds(g.getBounds());
      restyle();
    });
    return () => { cancelled = true; };
  }, [geo]);

  useEffect(() => () => { map.current?.remove(); map.current = null; }, []);

  function restyle() {
    layer.current?.eachLayer((l) => {
      const f = (l as unknown as { feature: GeoJSON.Feature }).feature;
      const id = String(f.properties?.codarea);
      const sel = fns.current.selected === id;
      (l as unknown as { setStyle: (s: object) => void }).setStyle({
        fillColor: fns.current.fill(id), fillOpacity: 0.9, color: sel ? "#111" : "#fdfbf6", weight: sel ? 2.5 : 0.6,
      });
    });
  }
  useEffect(restyle);

  return <div ref={el} style={{ height }} className="w-full rounded-md border border-border bg-muted" />;
}
