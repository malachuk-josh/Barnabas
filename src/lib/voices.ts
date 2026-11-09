// The scholars Ask can answer as, in the Commentary pop-up.
//
// Their names, their dates, and the life shown under the About pill — written
// here by hand rather than generated, because it is the one thing in the Ask
// box that is offered as fact. Each life is a few paragraphs, shown as they
// are written. How each one wrote and what he believed, as the model is told
// it, is in lib/voicePrompts.ts, which the server alone reads. Two of them are
// in the app in their own words: Matthew Henry on every book, and Spurgeon on
// the Psalms. When the reader is looking at one of those, what he actually
// wrote goes with the question and the answer is drawn from it. The rest
// answer from what is known of their writings.

export const VOICES = [
  {
    id: "henry",
    name: { en: "Matthew Henry", es: "Matthew Henry" },
    short: { en: "Henry", es: "Henry" },
    years: "1662–1714",
    bio: {
      en: [
        "Matthew Henry was born at Broad Oak, a farm on the border of Wales and England, in the year the Act of Uniformity silenced his father, Philip Henry, along with some two thousand other ministers who would not conform to the Church of England. He was taught at home by his father, then at a dissenting academy in London, and read law at Gray’s Inn before turning to the ministry.",
        "In 1687 he became minister of a Presbyterian congregation in Chester, and stayed twenty-five years, expounding the Bible in order, Sunday by Sunday — the work his commentary grew from. In 1704 he began his Exposition of the Old and New Testaments, a commentary on the whole Bible written for ordinary readers rather than scholars. He moved to Hackney, near London, in 1712, and died suddenly two years later while travelling, having reached the end of Acts. Thirteen other ministers finished the work, drawing partly on his notes.",
        "It has never been out of print. Spurgeon said that every minister ought to read it through carefully at least once. The app carries its Concise Commentary, an abridgement of the whole.",
      ],
      es: [
        "Matthew Henry nació en Broad Oak, una granja en la frontera entre Gales e Inglaterra, el mismo año en que la Ley de Uniformidad silenció a su padre, Philip Henry, junto con unos dos mil ministros que no quisieron someterse a la Iglesia de Inglaterra. Lo educó su padre en casa, después estudió en una academia disidente de Londres y cursó derecho en Gray’s Inn antes de dedicarse al ministerio.",
        "En 1687 llegó a ser ministro de una congregación presbiteriana en Chester, donde se quedó veinticinco años, explicando la Biblia en orden, domingo tras domingo: el trabajo del que nació su comentario. En 1704 comenzó su Exposición del Antiguo y el Nuevo Testamento, un comentario de toda la Biblia escrito para lectores comunes más que para eruditos. En 1712 se trasladó a Hackney, cerca de Londres, y murió de repente dos años después, durante un viaje, cuando había llegado al final de Hechos. Otros trece ministros terminaron la obra, en parte a partir de sus notas.",
        "Nunca ha dejado de imprimirse. Spurgeon decía que todo ministro debería leerla entera y con cuidado al menos una vez. La app incluye su Comentario conciso, una versión abreviada de la obra completa.",
      ],
    },
  },
  {
    id: "spurgeon",
    name: { en: "Charles Spurgeon", es: "Charles Spurgeon" },
    short: { en: "Spurgeon", es: "Spurgeon" },
    years: "1834–1892",
    bio: {
      en: [
        "Charles Haddon Spurgeon was born at Kelvedon, in Essex, and spent much of his early childhood with his grandfather, a Congregational minister. At fifteen a snowstorm drove him into a small Primitive Methodist chapel in Colchester, where a lay preacher took for his text “Look unto me, and be ye saved, all the ends of the earth” — the morning he dated his conversion from. He was baptized that spring and became a Baptist, and at seventeen was pastor of the village chapel at Waterbeach.",
        "At nineteen he was called to New Park Street Chapel in London. The crowds soon outgrew it, and the halls hired for him after it, and in 1861 the congregation opened the Metropolitan Tabernacle, which seated some five thousand, where he preached every Sunday for thirty years. His sermons were printed each week and sold around the world, until they filled sixty-three volumes. He also founded a college to train pastors and an orphanage at Stockwell.",
        "He wrote as he preached, plainly and warmly. The Treasury of David, his commentary on the Psalms, took him some twenty years, and Morning and Evening, his two readings for each day, is still read the world over; both are in the app. Ill for much of his later life, he died at Menton, in the south of France, at fifty-seven.",
      ],
      es: [
        "Charles Haddon Spurgeon nació en Kelvedon, en Essex, y pasó buena parte de su infancia con su abuelo, ministro congregacionalista. A los quince años, una tormenta de nieve lo hizo entrar en una pequeña capilla metodista primitiva de Colchester, donde un predicador laico tomó por texto «Mirad a mí, y sed salvos, todos los términos de la tierra»: desde aquella mañana contaba su conversión. Fue bautizado esa primavera, se hizo bautista, y a los diecisiete años era pastor de la capilla del pueblo de Waterbeach.",
        "A los diecinueve años lo llamaron a la capilla de New Park Street, en Londres. Pronto las multitudes la desbordaron, y también los salones que se alquilaron para él después, y en 1861 la congregación inauguró el Tabernáculo Metropolitano, con asientos para unas cinco mil personas, donde predicó cada domingo durante treinta años. Sus sermones se imprimían cada semana y se vendían en todo el mundo, hasta llenar sesenta y tres volúmenes. Fundó además un colegio para formar pastores y un orfanato en Stockwell.",
        "Escribía como predicaba, con sencillez y calidez. El Tesoro de David, su comentario de los Salmos, le llevó unos veinte años, y Mañana y tarde, sus dos lecturas para cada día, se sigue leyendo en todo el mundo; los dos están en la app. Enfermo durante buena parte de sus últimos años, murió en Menton, en el sur de Francia, a los cincuenta y siete años.",
      ],
    },
  },
  {
    id: "calvin",
    name: { en: "John Calvin", es: "Juan Calvino" },
    short: { en: "Calvin", es: "Calvino" },
    years: "1509–1564",
    bio: {
      en: [
        "John Calvin was born Jean Cauvin at Noyon, in northern France, and was sent by his father to study first for the church in Paris and then law at Orléans and Bourges. In his early twenties, by what he later called “a sudden conversion”, he turned to the teaching of the Reformation, and when Protestants came under persecution in France he fled to Basel. There, at twenty-six, he published the first edition of his Institutes of the Christian Religion, which he went on revising and enlarging for more than twenty years.",
        "Passing through Geneva in 1536, he was pressed by the reformer William Farel to stay and help, and did. The city put him out two years later; he spent three years as pastor to French refugees in Strasbourg, where he married Idelette de Bure, and then was called back. He never left Geneva again, preaching several times a week, ordering the life of its church, and founding an academy to train ministers.",
        "His commentaries cover most of the books of the Bible and are known for keeping close to the plain sense of the text. Through the ministers trained in Geneva his teaching shaped the Reformed churches of France, the Netherlands and Scotland, the English Puritans, and the Presbyterian churches that came from them. He died in Geneva and, at his own wish, was buried in an unmarked grave.",
      ],
      es: [
        "Juan Calvino nació en Noyon, en el norte de Francia, con el nombre de Jean Cauvin. Su padre lo envió a estudiar primero para la Iglesia en París y luego derecho en Orléans y Bourges. Pasados los veinte años, por lo que él mismo llamó «una conversión súbita», abrazó la enseñanza de la Reforma, y cuando los protestantes empezaron a ser perseguidos en Francia huyó a Basilea. Allí, a los veintiséis años, publicó la primera edición de su Institución de la religión cristiana, que siguió revisando y ampliando durante más de veinte años.",
        "Al pasar por Ginebra en 1536, el reformador Guillermo Farel le insistió en que se quedara a ayudar, y se quedó. La ciudad lo expulsó dos años después; pasó tres años como pastor de los refugiados franceses en Estrasburgo, donde se casó con Idelette de Bure, y luego lo llamaron de vuelta. Ya no dejó Ginebra: predicaba varias veces por semana, ordenó la vida de su iglesia y fundó una academia para formar ministros.",
        "Sus comentarios abarcan la mayoría de los libros de la Biblia y se distinguen por ceñirse al sentido llano del texto. Por medio de los ministros formados en Ginebra, su enseñanza dio forma a las iglesias reformadas de Francia, los Países Bajos y Escocia, a los puritanos ingleses y a las iglesias presbiterianas que nacieron de ellos. Murió en Ginebra y, por deseo propio, fue enterrado en una tumba sin nombre.",
      ],
    },
  },
  {
    id: "luther",
    name: { en: "Martin Luther", es: "Martín Lutero" },
    short: { en: "Luther", es: "Lutero" },
    years: "1483–1546",
    bio: {
      en: [
        "Martin Luther was born at Eisleben, in Saxony, and was studying law at Erfurt when, caught in a violent thunderstorm, he vowed to become a monk. He entered the Augustinian friary there, was ordained a priest, and became a doctor of theology and professor of the Bible at the new university of Wittenberg, lecturing on the Psalms, Romans and Galatians.",
        "Troubled for years over how a sinner could stand before a just God, he found his answer in Paul’s words, “the just shall live by faith”: God’s righteousness is a gift received by faith, not a wage earned. In 1517 his Ninety-five Theses against the sale of indulgences began the Reformation. Excommunicated, and outlawed after refusing to recant at the Diet of Worms in 1521, he was hidden in the Wartburg castle, where he translated the New Testament into German in about eleven weeks.",
        "His German Bible, finished in 1534, was read in homes across Germany and helped shape the German language itself. He married Katharina von Bora, a former nun, and their household became the model of the Protestant pastor’s home. He wrote catechisms for families and hymns for congregations to sing, among them “A Mighty Fortress Is Our God”, and died at Eisleben, the town where he was born.",
      ],
      es: [
        "Martín Lutero nació en Eisleben, en Sajonia, y estudiaba derecho en Erfurt cuando, sorprendido por una violenta tormenta, prometió hacerse monje. Entró en el convento agustino de la ciudad, fue ordenado sacerdote y llegó a ser doctor en teología y profesor de Biblia en la nueva universidad de Wittenberg, donde explicó los Salmos, Romanos y Gálatas.",
        "Durante años lo angustió cómo podía un pecador presentarse ante un Dios justo, y halló la respuesta en las palabras de Pablo, «el justo vivirá por la fe»: la justicia de Dios es un don que se recibe por la fe, no un salario que se gana. En 1517 sus Noventa y cinco tesis contra la venta de indulgencias dieron comienzo a la Reforma. Excomulgado, y proscrito por negarse a retractarse en la Dieta de Worms de 1521, lo escondieron en el castillo de Wartburg, donde tradujo el Nuevo Testamento al alemán en unas once semanas.",
        "Su Biblia alemana, terminada en 1534, se leyó en hogares de toda Alemania y ayudó a dar forma a la lengua alemana misma. Se casó con Catalina de Bora, una antigua monja, y su hogar llegó a ser el modelo de la casa del pastor protestante. Escribió catecismos para las familias e himnos para que cantaran las congregaciones, entre ellos «Castillo fuerte es nuestro Dios», y murió en Eisleben, la ciudad donde había nacido.",
      ],
    },
  },
  {
    id: "wesley",
    name: { en: "John Wesley", es: "John Wesley" },
    short: { en: "Wesley", es: "Wesley" },
    years: "1703–1791",
    bio: {
      en: [
        "John Wesley was the son of the rector of Epworth, in Lincolnshire, and of Susanna Wesley, who taught her many children at home. At five he was carried out of the burning rectory, and afterwards called himself “a brand plucked out of the burning”. At Oxford, with his brother Charles, he led a small society whose strict, methodical habits of prayer, study and service earned them the nickname Methodists.",
        "After a discouraging mission to Georgia, he went unwillingly to a meeting in Aldersgate Street, London, in May 1738, where someone was reading Luther’s preface to Romans, and felt his heart “strangely warmed”: he trusted in Christ alone for salvation. The next year he began preaching in the open air, and for fifty years rode the length of Britain and Ireland on horseback, by the usual reckoning some 250,000 miles, preaching in fields, market squares and mining villages.",
        "He gathered those who responded into societies and small classes led by lay preachers, but remained a priest of the Church of England all his life; in Britain, Methodism separated from it only after his death. Charles wrote thousands of hymns for them to sing, and John’s Explanatory Notes upon the New Testament and published sermons became the standard of Methodist teaching. He died in London at eighty-seven, saying, “The best of all is, God is with us.”",
      ],
      es: [
        "John Wesley era hijo del rector de Epworth, en Lincolnshire, y de Susanna Wesley, que educó en casa a sus muchos hijos. A los cinco años lo sacaron de la casa parroquial en llamas, y después se llamaba a sí mismo «un tizón arrebatado del incendio». En Oxford, con su hermano Charles, dirigió una pequeña sociedad cuyos hábitos estrictos y metódicos de oración, estudio y servicio les valieron el apodo de metodistas.",
        "Tras una misión desalentadora en Georgia, en mayo de 1738 acudió de mala gana a una reunión en Aldersgate Street, en Londres, donde alguien leía el prefacio de Lutero a Romanos, y sintió su corazón «extrañamente ardiente»: confió solo en Cristo para su salvación. Al año siguiente empezó a predicar al aire libre, y durante cincuenta años recorrió a caballo Gran Bretaña e Irlanda, unos cuatrocientos mil kilómetros según el cálculo habitual, predicando en campos, plazas de mercado y pueblos mineros.",
        "Reunió a quienes respondían en sociedades y en pequeñas clases dirigidas por predicadores laicos, pero siguió siendo sacerdote de la Iglesia de Inglaterra toda su vida; en Gran Bretaña, el metodismo se separó de ella solo después de su muerte. Charles escribió miles de himnos para que los cantaran, y las Notas explicativas sobre el Nuevo Testamento y los sermones publicados de John llegaron a ser la norma de la enseñanza metodista. Murió en Londres a los ochenta y siete años, diciendo: «Lo mejor de todo es que Dios está con nosotros».",
      ],
    },
  },
  {
    id: "augustine",
    name: { en: "Augustine", es: "Agustín" },
    short: { en: "Augustine", es: "Agustín" },
    years: "354–430",
    bio: {
      en: [
        "Augustine was born at Thagaste, a small town in Roman North Africa, to a pagan father and a Christian mother, Monica, who prayed for him for years. A brilliant student, he taught rhetoric at Carthage, at Rome and finally at Milan, spent nine years among the Manichees, and lived with a woman he never married, who bore him a son, Adeodatus.",
        "In Milan he heard Bishop Ambrose preach, and in a garden there in 386, hearing a child’s voice chanting “Take up and read”, he opened Paul’s letter to the Romans and was converted. Ambrose baptized him at Easter the next year. He went home to Africa meaning to live quietly in prayer and study, but was made a priest at Hippo almost against his will, and soon its bishop, which he remained for some thirty-five years.",
        "His Confessions tell the story of his life as one long prayer to God, beginning, “You have made us for yourself, and our heart is restless until it rests in you.” The City of God, written after Rome was sacked in 410, set the church’s hope beyond any earthly city. His expositions of all hundred and fifty Psalms and his sermons on the Gospel of John, many preached to his own people at Hippo, are read still. He died in 430 as the Vandals besieged Hippo, and few teachers have shaped the Western church, Catholic and Protestant, so deeply.",
      ],
      es: [
        "Agustín nació en Tagaste, una pequeña ciudad del norte de África romano, hijo de un padre pagano y de una madre cristiana, Mónica, que oró por él durante años. Estudiante brillante, enseñó retórica en Cartago, en Roma y por último en Milán, pasó nueve años entre los maniqueos y vivió con una mujer con la que nunca se casó, que le dio un hijo, Adeodato.",
        "En Milán escuchó predicar al obispo Ambrosio, y en un jardín de esa ciudad, en 386, al oír la voz de un niño que cantaba «Toma y lee», abrió la carta de Pablo a los Romanos y se convirtió. Ambrosio lo bautizó en la Pascua del año siguiente. Volvió a África con la intención de vivir en retiro, entregado a la oración y al estudio, pero en Hipona lo ordenaron sacerdote casi contra su voluntad, y pronto fue su obispo, cargo que ocupó unos treinta y cinco años.",
        "Sus Confesiones cuentan su vida como una larga oración a Dios, que comienza: «Nos hiciste para ti, y nuestro corazón está inquieto hasta que descanse en ti». La ciudad de Dios, escrita después del saqueo de Roma en 410, puso la esperanza de la Iglesia más allá de toda ciudad terrena. Sus exposiciones de los ciento cincuenta salmos y sus sermones sobre el Evangelio de Juan, muchos predicados a su propia gente en Hipona, se siguen leyendo hoy. Murió en 430, mientras los vándalos sitiaban Hipona, y pocos maestros han marcado tan hondo a la iglesia occidental, católica y protestante.",
      ],
    },
  },
  {
    id: "chrysostom",
    name: { en: "John Chrysostom", es: "Juan Crisóstomo" },
    short: { en: "Chrysostom", es: "Crisóstomo" },
    years: "c. 347–407",
    bio: {
      en: [
        "John was born at Antioch in Syria, one of the great cities of the Roman East, and raised by his mother, Anthusa, who was widowed young. He studied rhetoric under Libanius, the most famous teacher of his day, then gave himself to the Scriptures and to a life of strict self-denial, living for some years as a hermit in the mountains outside the city until his health broke down.",
        "Back in Antioch he was ordained, and for twelve years preached there verse by verse through whole books of the Bible, to crowds who sometimes broke into applause. In 398 he was made Archbishop of Constantinople, the capital. He spent the church’s money on hospitals and the poor rather than on display, and preached against the luxury of the rich and of the court, which made him powerful enemies. Twice deposed and sent into exile, he died on a forced march to a remoter place of banishment, saying, “Glory to God for all things.”",
        "The name Chrysostom, “golden-mouthed”, was given him after his death, for his preaching. Hundreds of his sermons survive, among them homilies on Genesis, Matthew, John, Acts and every letter of Paul, and they are still read in the churches of East and West. The liturgy that bears his name is the one most Orthodox churches celebrate on a Sunday.",
      ],
      es: [
        "Juan nació en Antioquía de Siria, una de las grandes ciudades del Oriente romano, y lo crio su madre, Antusa, que enviudó joven. Estudió retórica con Libanio, el maestro más célebre de su tiempo, y luego se entregó a las Escrituras y a una vida de estricta austeridad: vivió unos años como ermitaño en los montes cercanos a la ciudad, hasta que su salud se quebrantó.",
        "De vuelta en Antioquía fue ordenado, y durante doce años predicó allí, versículo a versículo, libros enteros de la Biblia, ante multitudes que a veces estallaban en aplausos. En 398 fue nombrado arzobispo de Constantinopla, la capital. Gastó los bienes de la iglesia en hospitales y en los pobres antes que en ostentación, y predicó contra el lujo de los ricos y de la corte, lo que le ganó enemigos poderosos. Depuesto y desterrado dos veces, murió en una marcha forzada hacia un destierro más lejano, diciendo: «Gloria a Dios por todo».",
        "El nombre de Crisóstomo, «boca de oro», se le dio después de su muerte, por su predicación. Se conservan cientos de sus sermones, entre ellos homilías sobre Génesis, Mateo, Juan, Hechos y todas las cartas de Pablo, y se siguen leyendo en las iglesias de Oriente y Occidente. La liturgia que lleva su nombre es la que celebran el domingo la mayoría de las iglesias ortodoxas.",
      ],
    },
  },
] as const;

export type VoiceId = (typeof VOICES)[number]["id"];

export function isVoice(id: unknown): id is VoiceId {
  return VOICES.some((v) => v.id === id);
}

export function voiceOf(id: VoiceId) {
  return VOICES.find((v) => v.id === id)!;
}

/** The ones whose own commentary the app carries, and can send along. */
export const HAS_SOURCE: readonly VoiceId[] = ["henry", "spurgeon"];
