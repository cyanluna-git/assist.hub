import { Mail, MessageSquarePlus, RefreshCw } from "lucide-react";
import { fetchBulletins } from "@/lib/bulletin";
import { addManualBulletinAction, syncGmailBulletinsAction } from "./actions";
import BulletinBoard from "./BulletinBoard";
import styles from "./bulletin.module.css";

export default async function BulletinPage() {
  const bulletins = await fetchBulletins();

  return (
    <>
      <header className="page-hero">
        <p className="page-kicker">Unified Notices</p>
        <h1 className="page-title">Bulletin</h1>
        <p className="page-subtitle">학사 문자와 `assist.ac.kr` Gmail 공지를 한 보드에서 모아 확인합니다.</p>
      </header>

      <section className={styles.topGrid}>
        <article className={`card ${styles.panel}`}>
          <h2 className={styles.panelTitle}>
            <MessageSquarePlus size={18} style={{ marginRight: 8, verticalAlign: "text-bottom" }} />
            문자 공지 직접 등록
          </h2>
          <p className={styles.panelText}>학사팀 문자를 복사해두면 게시판에 같이 저장됩니다.</p>

          <form action={addManualBulletinAction} className={styles.form}>
            <input name="title" className={styles.input} placeholder="예: 학사팀 공지 문자" />
            <textarea
              name="content"
              className={styles.textarea}
              placeholder="문자 내용을 그대로 붙여넣으세요."
            />
            <button type="submit" className={styles.primaryButton}>
              등록하기
            </button>
          </form>
        </article>

        <article className={`card ${styles.panel}`}>
          <h2 className={styles.panelTitle}>
            <Mail size={18} style={{ marginRight: 8, verticalAlign: "text-bottom" }} />
            Gmail 공지 수집
          </h2>
          <p className={styles.panelText}>Gmail에서 `assist.ac.kr` 발신 메일만 읽어와 Bulletin에 적재합니다.</p>

          <form action={syncGmailBulletinsAction} className={styles.form}>
            <button type="submit" className={styles.secondaryButton}>
              <RefreshCw size={15} />
              Gmail 동기화
            </button>
          </form>

          <ul className={styles.helperList}>
            <li>`ops/setup_classroom.py`에 Gmail 읽기 권한이 추가되어야 합니다.</li>
            <li>기존 `token.json`에 Gmail scope가 없으면 인증을 다시 받아야 합니다.</li>
          </ul>
        </article>
      </section>

      <BulletinBoard
        items={bulletins.map((item) => ({
          id: item.id,
          sourceType: item.sourceType,
          title: item.title,
          content: item.content,
          sender: item.sender,
          receivedAt: item.receivedAt.toISOString(),
          isPinned: item.isPinned,
          isArchived: item.isArchived,
        }))}
      />
    </>
  );
}
