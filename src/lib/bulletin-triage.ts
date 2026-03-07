export type BulletinTriageCategory =
  | "ACADEMICS"
  | "ATTENDANCE"
  | "INTERVIEW"
  | "TUITION"
  | "EVENT"
  | "ADMIN"
  | "GENERAL";

export type BulletinAttentionLevel = "HIGH" | "MEDIUM" | "LOW";

export type BulletinTriageResult = {
  category: BulletinTriageCategory;
  attention: BulletinAttentionLevel;
  pinSuggested: boolean;
  matchedRules: string[];
};

type BulletinRule = {
  id: string;
  category: BulletinTriageCategory;
  attention: BulletinAttentionLevel;
  pinSuggested?: boolean;
  senders?: RegExp[];
  keywords?: RegExp[];
};

const RULES: BulletinRule[] = [
  {
    id: "attendance",
    category: "ATTENDANCE",
    attention: "HIGH",
    pinSuggested: true,
    keywords: [/출석/i, /스마트 출결/i, /인증코드/i, /zoom 입장/i],
  },
  {
    id: "interview",
    category: "INTERVIEW",
    attention: "HIGH",
    pinSuggested: true,
    keywords: [/입학인터뷰/i, /인터뷰/i, /면접/i],
  },
  {
    id: "tuition",
    category: "TUITION",
    attention: "HIGH",
    pinSuggested: true,
    keywords: [/등록금/i, /납부/i, /장학/i],
  },
  {
    id: "academics",
    category: "ACADEMICS",
    attention: "HIGH",
    pinSuggested: true,
    keywords: [/수강/i, /교양학점/i, /과제/i, /강의/i, /수업/i, /학사/i],
  },
  {
    id: "admin-assist",
    category: "ADMIN",
    attention: "MEDIUM",
    senders: [/assist\.ac\.kr/i],
    keywords: [/안내/i, /공지/i, /제출/i, /오리엔테이션/i],
  },
  {
    id: "event",
    category: "EVENT",
    attention: "MEDIUM",
    keywords: [/행사/i, /세미나/i, /특강/i, /설명회/i],
  },
];

function matchesRule(rule: BulletinRule, sender: string, haystack: string) {
  const senderMatched = rule.senders?.some((pattern) => pattern.test(sender)) ?? false;
  const keywordMatched = rule.keywords?.some((pattern) => pattern.test(haystack)) ?? false;
  return senderMatched || keywordMatched;
}

export function deriveBulletinTriage(input: {
  sourceType: string;
  title: string;
  content: string;
  sender: string | null;
}) : BulletinTriageResult {
  const sender = (input.sender ?? "").toLowerCase();
  const haystack = `${input.title}\n${input.content}`.toLowerCase();
  const matched = RULES.filter((rule) => matchesRule(rule, sender, haystack));
  const primary = matched[0];

  if (!primary) {
    return {
      category: input.sourceType === "SMS" ? "ACADEMICS" : "GENERAL",
      attention: input.sourceType === "SMS" ? "MEDIUM" : "LOW",
      pinSuggested: false,
      matchedRules: [],
    };
  }

  return {
    category: primary.category,
    attention: primary.attention,
    pinSuggested: Boolean(primary.pinSuggested),
    matchedRules: matched.map((rule) => rule.id),
  };
}

export function getBulletinCategoryLabel(category: BulletinTriageCategory) {
  switch (category) {
    case "ACADEMICS":
      return "학사";
    case "ATTENDANCE":
      return "출결";
    case "INTERVIEW":
      return "인터뷰";
    case "TUITION":
      return "등록";
    case "EVENT":
      return "행사";
    case "ADMIN":
      return "운영";
    case "GENERAL":
    default:
      return "일반";
  }
}

export function getBulletinAttentionLabel(attention: BulletinAttentionLevel) {
  switch (attention) {
    case "HIGH":
      return "중요";
    case "MEDIUM":
      return "확인";
    case "LOW":
    default:
      return "참고";
  }
}
