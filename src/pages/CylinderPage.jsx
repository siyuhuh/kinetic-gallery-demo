import { KineticExhibitionHero } from '../components/KineticExhibitionHero';
import styles from './CylinderPage.module.scss';

const CYLINDER_IMAGES = Array.from({ length: 19 }, (_, index) => ({
    src: `${import.meta.env.BASE_URL}images/img${index + 1}.webp`,
}));

export default function CylinderPage() {
    return (
        <section className={styles.page}>
            <div className={styles.titleBlock}>
                <p className={styles.eyebrow}>Art Exhibition UK</p>
                <h1 className={styles.title}>Cylinder Kinetic Demo</h1>
                <p className={styles.hint}>Scroll or drag to spin · pointer tilts the tower</p>
            </div>
            <div className={styles.stage}>
                <KineticExhibitionHero items={CYLINDER_IMAGES} />
            </div>
        </section>
    );
}
