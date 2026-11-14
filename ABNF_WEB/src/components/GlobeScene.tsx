import { useEffect, useRef } from 'preact/hooks';
import gsap from 'gsap';

export default function GlobeScene() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let world: any;
    let handleResize: () => void;

    import('globe.gl').then(({ default: Globe }) => {
      if (!containerRef.current) return;

      world = new Globe(containerRef.current)
        .globeImageUrl('/textures/earth-night.jpg')
        .backgroundColor('rgba(0,0,0,0)');

      gsap.from(world.camera().position, {
        z: 600,
        duration: 2,
        ease: 'power3.out'
      });

      handleResize = () => {
        if (containerRef.current && world) {
          world.width(containerRef.current.clientWidth);
          world.height(containerRef.current.clientHeight);
        }
      };
      window.addEventListener('resize', handleResize);
      handleResize();
    });

    return () => {
      if (handleResize) window.removeEventListener('resize', handleResize);
      if (world?._destructor) world._destructor();
    };
  }, []);

  return <div ref={containerRef} class="w-full h-screen overflow-hidden" />;
}
