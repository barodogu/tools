/*! 바로도구 신분증 가림 도구 — 신분증별 자동 가림 위치 v0.2
 *  좌표는 '기울기 보정 후 신분증 면 전체'를 1로 본 비율 [x, y, 너비, 높이] 입니다.
 *  공개 견본 기준의 대략적인 위치이므로, 화면에서 반드시 확인·보정하도록 안내합니다.
 *  신분증 디자인이 바뀌면 새 항목(예: 'id-2027')을 추가하세요.
 */
window.IDMASK_TEMPLATES = {
  'id': {
    name: '주민등록증', aspect: 85.6 / 54, mm: [85.6, 54],
    fields: [
      { key: 'rrn',     label: '주민번호 뒷자리', rect: [0.33, 0.30, 0.31, 0.12], on: true },
      { key: 'addr',    label: '주소',            rect: [0.05, 0.43, 0.60, 0.25] },
      { key: 'issue',   label: '발급일·발급기관', rect: [0.20, 0.72, 0.50, 0.22] },
      { key: 'name',    label: '이름',            rect: [0.05, 0.17, 0.40, 0.12] },
      { key: 'photo',   label: '사진',            rect: [0.66, 0.16, 0.30, 0.64] }
    ]
  },
  'driver': {
    name: '운전면허증', aspect: 85.6 / 54, mm: [85.6, 54],
    fields: [
      { key: 'rrn',     label: '주민번호 뒷자리', rect: [0.55, 0.36, 0.32, 0.10], on: true },
      { key: 'licno',   label: '면허번호',        rect: [0.30, 0.17, 0.48, 0.10] },
      { key: 'addr',    label: '주소',            rect: [0.30, 0.46, 0.66, 0.18] },
      { key: 'serial',  label: '암호일련번호',    rect: [0.03, 0.78, 0.28, 0.12] },
      { key: 'name',    label: '이름',            rect: [0.30, 0.27, 0.36, 0.10] },
      { key: 'photo',   label: '사진',            rect: [0.03, 0.19, 0.25, 0.57] }
    ]
  },
  'passport-old': {
    name: '여권 (구형, 주민번호 있음)', aspect: 125 / 88, mm: [125, 88],
    fields: [
      { key: 'rrn',     label: '주민번호 뒷자리', rect: [0.62, 0.52, 0.32, 0.08], on: true },
      { key: 'ppno',    label: '여권번호',        rect: [0.68, 0.16, 0.30, 0.09] },
      { key: 'mrz',     label: '하단 기계판독영역(MRZ) 2줄', rect: [0.02, 0.78, 0.96, 0.20] },
      { key: 'photo',   label: '사진',            rect: [0.03, 0.19, 0.28, 0.54] }
    ]
  },
  'passport-new': {
    name: '여권 (차세대, 2020.12~)', aspect: 125 / 88, mm: [125, 88],
    fields: [
      { key: 'ppno',    label: '여권번호',        rect: [0.68, 0.16, 0.30, 0.09] },
      { key: 'mrz',     label: '하단 기계판독영역(MRZ) 2줄', rect: [0.02, 0.78, 0.96, 0.20] },
      { key: 'photo',   label: '사진',            rect: [0.03, 0.19, 0.28, 0.54] }
    ]
  },
  'alien': {
    name: '외국인등록증', aspect: 85.6 / 54, mm: [85.6, 54],
    fields: [
      { key: 'regno',   label: '등록번호 뒷자리', rect: [0.47, 0.19, 0.32, 0.11], on: true },
      { key: 'nation',  label: '국가/지역',       rect: [0.35, 0.40, 0.42, 0.11] },
      { key: 'visa',    label: '체류자격',        rect: [0.35, 0.52, 0.42, 0.11] },
      { key: 'name',    label: '이름',            rect: [0.35, 0.29, 0.55, 0.11] },
      { key: 'photo',   label: '사진',            rect: [0.04, 0.18, 0.28, 0.62] }
    ]
  },
  'disability': {
    name: '장애인등록증', aspect: 85.6 / 54, mm: [85.6, 54],
    fields: [
      { key: 'rrn',     label: '주민번호 뒷자리', rect: [0.33, 0.33, 0.31, 0.12], on: true },
      { key: 'addr',    label: '주소',            rect: [0.05, 0.46, 0.60, 0.22] },
      { key: 'grade',   label: '장애 정도',       rect: [0.05, 0.70, 0.55, 0.13] },
      { key: 'photo',   label: '사진',            rect: [0.66, 0.16, 0.30, 0.64] }
    ]
  },
  'mobile': {
    name: '모바일 신분증 캡처', aspect: 0, mm: null,
    fields: [
      { key: 'rrn',     label: '주민번호 뒷자리', rect: [0.45, 0.43, 0.47, 0.06], on: true },
      { key: 'addr',    label: '주소',            rect: [0.06, 0.50, 0.88, 0.09] },
      { key: 'qr',      label: 'QR코드',          rect: [0.22, 0.62, 0.56, 0.26] },
      { key: 'photo',   label: '사진',            rect: [0.30, 0.11, 0.40, 0.27] }
    ]
  },
  'custom': {
    name: '기타 (직접 가리기)', aspect: 0, mm: null,
    fields: []
  }
};