import styles from './HeroSection.module.css';

export default function HeroSection() {
  return (
    <section className={styles.hero}>
      <div className={styles.container}>
        <div className={styles.content}>
          <h1 className={styles.headline}>Validate before you build.</h1>
          <p className={styles.subheadline}>
            FounderAI turns startup ideas into evidence-based 7-day validation sprints so you don't waste months building the wrong thing.
          </p>
          <div className={styles.buttons}>
            <button className={styles.primaryCta}>Validate My Idea</button>
            <button className={styles.secondaryCta}>See Example Report</button>
          </div>
        </div>
        <div className={styles.previewCard}>
          <div className={styles.verdict}>
            <span className={styles.verdictLabel}>Validation Verdict:</span>
            <span className={styles.verdictValue verdictPivot}>Pivot</span>
          </div>
          <div className={styles.assumption}>
            <span className={styles.label}>Biggest Assumption:</span>
            <span className={styles.value>“Customers will pay for this solution.”</span>
          </div>
          <div className={styles.sprint}>
            <span className={styles.label}>Current Sprint:</span>
            <span className={styles.value}>Interview 10 founders</span>
          </div>
          <div className={styles.progress}>
            <span className={styles.label}>Progress:</span>
            <div className={styles.progressBar}>
              <div className={styles.progressFill} style={{ width: '40%' }}></div>
            </div>
            <span className={styles.progressText}>40%</span>
          </div>
        </div>
      </div>
    </section>
  );
}