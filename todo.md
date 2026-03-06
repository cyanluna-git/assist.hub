# TODO

## Priority Roadmap

1. Document Viewer 실사용 완성
- My Notes 자동저장(디바운스) + 저장 상태 표시
- AI Summary 생성 버튼(문서 단위) + 생성 중 로딩 상태

2. Dashboard를 실행 중심으로 개선
- 다음 마감 3개, 읽지 않은 자료, 요약 없는 문서 위젯 추가
- 카드/버튼 동선을 실제 작업 흐름에 맞게 정리

3. 검색 기능 구현
- 제목/유형/pdf-md 통합 검색
- Command Palette(Cmd+K)에서 문서/화면 빠른 이동

4. 데이터 동기화 안정화
- syncMaterials 호출을 페이지 렌더 시점에서 분리
- 실패 로그/재시도/중복 방지(캘린더 export idempotency)

5. 과제 상태 워크플로우 강화
- TODO / IN_PROGRESS / DONE 상태 변경 UI
- Schedule 필터(임박/완료/기한없음) + 정렬

6. 성능/품질 마무리
- PDF/대용량 리스트 lazy loading
- E2E 기본 시나리오 테스트 추가
