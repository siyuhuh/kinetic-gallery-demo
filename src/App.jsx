import { Canvas, useFrame } from '@react-three/fiber';
import { OrthographicCamera, RoundedBox, useTexture } from '@react-three/drei';
import { useRef, useState, useEffect, useMemo } from 'react';
import { easing } from 'maath';
import * as THREE from 'three';
import styles from './App.module.scss';

const COUNT = 19;
const INITIAL_SPACING = 0.05;
const FINAL_SPACING = 0.6;
const CARD_SIZE = 1;
const CARD_THICKNESS = 0.02;
const IMAGE_DEPTH = CARD_THICKNESS;

const glassVertexShader = `
    varying vec3 vNormal;
    varying vec2 vUv;
    void main() {
        vNormal = normalize(normalMatrix * normal);
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const glassFragmentShader = `
    varying vec3 vNormal;
    varying vec2 vUv;
    uniform sampler2D uTexture;

    void main() {
        vec2 uv = clamp(vUv, 0.001, 0.999);
        vec3 edgeSample = (
            texture2D(uTexture, vec2(0.02, uv.y)).rgb +
            texture2D(uTexture, vec2(0.98, uv.y)).rgb +
            texture2D(uTexture, vec2(uv.x, 0.02)).rgb +
            texture2D(uTexture, vec2(uv.x, 0.98)).rgb
        ) * 0.25;

        vec3 glassBase = vec3(0.04, 0.045, 0.05);
        float fres = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.5);

        vec3 tinted = mix(glassBase, edgeSample, 0.5);
        tinted = mix(tinted, edgeSample, fres * 0.3);

        float alpha = 0.05 + fres * 0.1;
        gl_FragColor = vec4(tinted, alpha);
    }
`;

const imageVertexShader = `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const imageFragmentShader = `
    varying vec2 vUv;
    uniform sampler2D uTexture;
    uniform float uOpacity;

    void main() {
        vec2 uv = clamp(vUv, 0.0, 1.0);
        vec4 color = texture2D(uTexture, uv);

        float edgeX = smoothstep(0.32, 0.46, abs(uv.x - 0.5));
        float edgeY = smoothstep(0.32, 0.46, abs(uv.y - 0.5));
        float edge = clamp(max(edgeX, edgeY), 0.0, 1.0);

        vec3 edgeXCol = (
            texture2D(uTexture, vec2(0.04, uv.y)).rgb +
            texture2D(uTexture, vec2(0.96, uv.y)).rgb
        ) * 0.5;
        vec3 edgeYCol = (
            texture2D(uTexture, vec2(uv.x, 0.04)).rgb +
            texture2D(uTexture, vec2(uv.x, 0.96)).rgb
        ) * 0.5;
        vec3 edgeColor = mix(edgeXCol, edgeYCol, 0.1);

        vec2 dir = normalize(uv - 0.5 + 1e-4);
        float spread = 0.02 * edge;
        vec3 blur =
            texture2D(uTexture, uv).rgb * 0.55 +
            texture2D(uTexture, uv + dir * spread * 0.7).rgb * 0.25 +
            texture2D(uTexture, uv + dir * spread * 1.2).rgb * 0.2;

        vec3 tinted = mix(color.rgb, edgeColor, edge * 0.04);
        tinted = mix(tinted, blur, edge * 0.3);

        float minAlpha = 0.85;
        float alpha = mix(1.0, minAlpha, edge) * uOpacity;
        gl_FragColor = vec4(tinted, color.a * alpha);
    }
`;

function Card({ index, position, onPointerOver, onPointerOut, hovered, active }) {
    const cardRef = useRef();
    const imageShaderRef = useRef();
    const texture = useTexture(`/images/img${(index % 19) + 1}.webp`);

    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.flipY = true;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    const shaderUniforms = useMemo(
        () => ({
            uTexture: { value: texture },
            uOpacity: { value: 1.0 },
        }),
        [texture]
    );

    const glassUniforms = useMemo(
        () => ({
            uTexture: { value: texture },
        }),
        [texture]
    );

    useFrame((_, delta) => {
        if (!cardRef.current) return;

        const f = hovered ? 1.25 : active ? 1.25 : 1;
        const targetOpacity = hovered ? 1.0 : 0.85;

        easing.damp3(cardRef.current.position, [0, 0, hovered ? 0.9 : 0], 0.4, delta);
        easing.damp3(cardRef.current.scale, [f, f, f], 0.15, delta);

        if (imageShaderRef.current?.uniforms?.uOpacity) {
            easing.damp(imageShaderRef.current.uniforms.uOpacity, 'value', targetOpacity, 0.2, delta);
        }
    });

    const imageZ = CARD_THICKNESS / 2 + IMAGE_DEPTH / 2 + 0.0003;

    return (
        <group position={position}>
            <group ref={cardRef} rotation={[0, -Math.PI / 2, 0]} renderOrder={-index * 2}>
                <RoundedBox
                    args={[CARD_SIZE, CARD_SIZE, CARD_THICKNESS]}
                    radius={0.02}
                    smoothness={4}
                    renderOrder={index * 2 + 1}
                >
                    <shaderMaterial
                        uniforms={glassUniforms}
                        transparent
                        depthWrite={false}
                        depthTest
                        vertexShader={glassVertexShader}
                        fragmentShader={glassFragmentShader}
                    />
                </RoundedBox>

                <mesh
                    position={[0, 0, imageZ]}
                    renderOrder={-(index * 2 + 1)}
                    onPointerOver={(e) => (e.stopPropagation(), onPointerOver(index))}
                    onPointerOut={(e) => (e.stopPropagation(), onPointerOut())}
                >
                    <boxGeometry args={[CARD_SIZE, CARD_SIZE, IMAGE_DEPTH]} />
                    <shaderMaterial
                        ref={imageShaderRef}
                        uniforms={shaderUniforms}
                        transparent
                        depthWrite={false}
                        depthTest
                        polygonOffset
                        polygonOffsetFactor={-2}
                        polygonOffsetUnits={-2}
                        vertexShader={imageVertexShader}
                        fragmentShader={imageFragmentShader}
                    />
                </mesh>
            </group>
        </group>
    );
}

function CameraController({ triggerAnimation, onProgressChange }) {
    const cameraRef = useRef();
    const [startTime] = useState(Date.now());
    const [animationTriggered, setAnimationTriggered] = useState(false);
    const [animationStartTime, setAnimationStartTime] = useState(null);

    useFrame(() => {
        if (!cameraRef.current) return;

        const elapsed = (Date.now() - startTime) / 1000;
        if (!animationTriggered && (elapsed > 5 || triggerAnimation)) {
            setAnimationTriggered(true);
            setAnimationStartTime(Date.now());
        }

        let progress = 0;

        if (animationTriggered && animationStartTime) {
            const animationElapsed = (Date.now() - animationStartTime) / 1000;
            const animationProgress = Math.min(animationElapsed / 3, 1);
            progress =
                animationProgress < 0.5
                    ? 2 * animationProgress * animationProgress
                    : 1 - Math.pow(-2 * animationProgress + 2, 2) / 2;
        }

        onProgressChange(progress);

        const startPos = [-30, 0, 0];
        const endPos = [-40, 15, 30];
        const curveProgress = Math.sin(progress * Math.PI * 0.5);

        cameraRef.current.position.set(
            startPos[0] + (endPos[0] - startPos[0]) * curveProgress,
            startPos[1] + (endPos[1] - startPos[1]) * curveProgress,
            startPos[2] + (endPos[2] - startPos[2]) * curveProgress
        );

        cameraRef.current.lookAt(0, 0, 0);
    });

    return (
        <OrthographicCamera
            ref={cameraRef}
            makeDefault
            zoom={300}
            position={[-40, 0, 0]}
            near={0.01}
            far={100000}
        />
    );
}

function Cards({ onFirstHover, currentSpacing, viewRef }) {
    const [hovered, hover] = useState(null);
    const [scrollOffset, setScrollOffset] = useState(() => {
        const totalWidth = COUNT * INITIAL_SPACING;
        return totalWidth / 2 - INITIAL_SPACING;
    });
    const [hasTriggeredFirstHover, setHasTriggeredFirstHover] = useState(false);
    const groupRef = useRef();

    const maxScrollLeft = (COUNT * currentSpacing) / 2 - currentSpacing;
    const maxScrollRight = -((COUNT * currentSpacing) / 2 - currentSpacing);

    const handleCardHover = (index) => {
        hover(index);
        if (!hasTriggeredFirstHover) {
            setHasTriggeredFirstHover(true);
            onFirstHover();
        }
    };

    useEffect(() => {
        const newMaxScrollLeft = COUNT * currentSpacing / 2 - currentSpacing;
        if (scrollOffset >= maxScrollLeft * 0.9) {
            setScrollOffset(newMaxScrollLeft);
        }
    }, [currentSpacing, maxScrollLeft, scrollOffset]);

    useEffect(() => {
        const handleWheel = (event) => {
            const viewElement = viewRef?.current;
            if (!viewElement) return;

            const rect = viewElement.getBoundingClientRect();
            const isOverView =
                event.clientX >= rect.left &&
                event.clientX <= rect.right &&
                event.clientY >= rect.top &&
                event.clientY <= rect.bottom;

            if (!isOverView) return;

            const newOffset = scrollOffset - event.deltaY * 0.01;
            const clampedOffset = Math.max(maxScrollRight, Math.min(maxScrollLeft, newOffset));
            const atLeftBoundary = scrollOffset >= maxScrollLeft && event.deltaY < 0;
            const atRightBoundary = scrollOffset <= maxScrollRight && event.deltaY > 0;

            if (!atLeftBoundary && !atRightBoundary) {
                event.preventDefault();
                setScrollOffset(clampedOffset);
            }
        };

        window.addEventListener('wheel', handleWheel, { passive: false });
        return () => window.removeEventListener('wheel', handleWheel);
    }, [maxScrollLeft, maxScrollRight, scrollOffset, viewRef]);

    useFrame((_, delta) => {
        if (groupRef.current) {
            easing.damp3(groupRef.current.position, [scrollOffset, 0, 0], 0.1, delta);
        }
    });

    return (
        <group ref={groupRef}>
            {Array.from({ length: COUNT }).map((_, index) => (
                <Card
                    key={`card-${index}`}
                    index={index}
                    position={[index * currentSpacing - (COUNT * currentSpacing) / 2, 0, 0]}
                    onPointerOver={handleCardHover}
                    onPointerOut={() => hover(null)}
                    hovered={hovered === index}
                    active={hovered !== null}
                />
            ))}
        </group>
    );
}

const MARQUEE_ITEMS = [
    'Contemporary Art',
    'Digital Experience',
    'Curated Collection',
    'Modern Gallery',
    'Immersive Journey',
    'Artistic Vision',
    'Creative Expression',
    'Visual Stories',
];

export default function App() {
    const [shouldTriggerAnimation, setShouldTriggerAnimation] = useState(false);
    const [animationProgress, setAnimationProgress] = useState(0);
    const viewRef = useRef();

    const currentSpacing =
        INITIAL_SPACING + (FINAL_SPACING - INITIAL_SPACING) * animationProgress;

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <span className={styles.logo}>Kinetic Gallery</span>
                <div className={styles.headerMeta}>
                    <span className={styles.hint}>Hover a card · or wait 5s to start</span>
                    <a
                        className={styles.repoLink}
                        href="https://github.com/siyuhuh/kinetic-gallery-demo"
                        target="_blank"
                        rel="noreferrer"
                    >
                        GitHub
                    </a>
                </div>
            </header>

            <div ref={viewRef} className={styles.view}>
                <Canvas className={styles.canvas} dpr={[1, 2]}>
                    <CameraController
                        triggerAnimation={shouldTriggerAnimation}
                        onProgressChange={setAnimationProgress}
                    />
                    <ambientLight intensity={1.4} />
                    <directionalLight position={[10, 10, 5]} intensity={1.9} />
                    <pointLight position={[0, 0, 10]} intensity={0.5} color="#ffffff" />
                    <Cards
                        onFirstHover={() => setShouldTriggerAnimation(true)}
                        currentSpacing={currentSpacing}
                        viewRef={viewRef}
                    />
                </Canvas>
            </div>

            <div className={styles.content}>
                <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>Explore Our Gallery</h2>
                    <div className={styles.infiniteScroll}>
                        <div className={styles.scrollTrack}>
                            {[0, 1].map((loop) => (
                                <div key={loop} className={styles.scrollContent}>
                                    {MARQUEE_ITEMS.map((text) => (
                                        <div key={`${loop}-${text}`} className={styles.scrollItem}>
                                            {text}
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </div>
                    <p className={styles.sectionText}>
                        Discover contemporary art through an immersive digital experience. Scroll
                        horizontally over the gallery, then continue below.
                    </p>
                </div>
            </div>
        </div>
    );
}
