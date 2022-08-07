import { Col, Row, Card } from "react-bootstrap";

function Stakenft(props) {
    return (
      <Row className='h-64 border-2 rounded-xl border-black'>
        {!props.loading &&
            props.nfts.map((metadata, index) => (
              <Col xs="6" md="3" lg="2" key={index}>
                <div className="relative w-44 md:w-auto 2xl:w-48">
                <Card
                  onClick={() => {
                    props.select(metadata);
                  }}
                  className="imageGrid"
                  lg="3"
                  style={{
                    width: "100%",
                    backgroundColor: "#2B3964",
                    padding: "10px",
                    borderRadius: "10px",
                    boxShadow: props.isListedNftSelected(metadata)
                      ? `0px 0px 20px #0000ff`
                      : '',
                  }}
                >
                  <Card.Img
                    variant="top"
                    src={metadata?.image}
                    alt={metadata?.name}
                  />
                  <Card.Body>
                    <Card.Title style={{ color: "#fff" }}>
                      {metadata?.name}
                    </Card.Title>
                  </Card.Body>
                </Card>
                {props.isListedNftSelected(metadata) && (
                                  <div
                                    className={`absolute top-4 left-4`}
                                    style={{
                                      height: '10px',
                                      width: '10px',
                                      backgroundColor: '#f00',
                                      borderRadius: '50%',
                                      display: 'inline-block',
                                    }}
                                  />
                                )}
                </div>
              </Col>
        ))}          
      </Row>
    );
}

export default Stakenft;